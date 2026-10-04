import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import r2Service from './r2-service';
import storageCleanupService from './storage-cleanup-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingService from "./setting-service";
import { contentDisposition, isSafeInlineMimeType, normalizeAttachmentFilename, normalizeMimeType } from '../utils/outgoing-mail-validation';
import BizError from '../error/biz-error';
import { email } from '../entity/email';

const attService = {
	/** Freeze attachment bytes into content-addressed storage before provider dispatch. */
	async freezeForOutboundSnapshot(c, imageDataList, attachments) {
		const frozen = [];
		for (const image of imageDataList) {
			const bytes = image.buff || image.content;
			if (!bytes) continue;
			await r2Service.putObj(c, image.key, bytes, {
				contentType: normalizeMimeType(image.mimeType),
				cacheControl: image.contentId ? 'max-age=259200' : 'private, no-store',
				contentDisposition: contentDisposition(image.filename || 'attachment', Boolean(image.contentId)),
			});
			frozen.push({ key: image.key, filename: image.filename || '', mimeType: normalizeMimeType(image.mimeType), size: image.size || bytes.byteLength, contentId: image.contentId || '', kind: 'embed' });
		}
		for (const raw of attachments) {
			const filename = normalizeAttachmentFilename(raw.filename || 'attachment');
			const mimeType = normalizeMimeType(raw.type || raw.mimeType || raw.contentType);
			const bytes = fileUtils.base64ToUint8Array(raw.content);
			const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(bytes) + fileUtils.getExtFileName(filename);
			await r2Service.putObj(c, key, bytes, { contentType: mimeType, contentDisposition: contentDisposition(filename) });
			frozen.push({ key, filename, mimeType, size: bytes.byteLength, contentId: '', kind: 'attachment' });
		}
		return frozen;
	},

	async loadFrozenSnapshotAttachments(c, frozen) {
		const result = [];
		for (const item of frozen || []) {
			const object = await r2Service.getObj(c, item.key);
			if (!object) throw new BizError('Frozen outbound attachment is unavailable', 409);
			result.push({ ...item, content: object instanceof ArrayBuffer ? object : await object.arrayBuffer() });
		}
		return result;
	},

	async attachFrozenSnapshot(c, frozen, userId, accountId, emailId, operationId) {
		for (const [ordinal, item] of (frozen || []).entries()) {
			await orm(c).insert(att).values({
				userId, accountId, emailId, key: item.key, filename: item.filename, mimeType: item.mimeType,
				size: item.size, type: item.kind === 'embed' ? attConst.type.EMBED : attConst.type.ATT,
				contentId: item.contentId || null, sendOperationId: operationId, sendOrdinal: ordinal,
			}).onConflictDoNothing().run();
		}
	},

	async addAtt(c, attachments) {

		for (let attachment of attachments) {
			attachment.filename = normalizeAttachmentFilename(attachment.filename || 'attachment');
			attachment.mimeType = normalizeMimeType(attachment.mimeType);
			if (attachment.contentId && !isSafeInlineMimeType(attachment.mimeType)) attachment.contentId = null;

			let metadate = {
				contentType: attachment.mimeType,
			}

			if (!attachment.contentId) {
				metadate.contentDisposition = contentDisposition(attachment.filename)
			} else {
				metadate.contentDisposition = contentDisposition(attachment.filename, true)
				metadate.cacheControl = `max-age=259200`
			}

			await r2Service.putObj(c, attachment.key, attachment.content, metadate);

		}

		await orm(c).insert(att).values(attachments).run();
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content, userId, sendKey = '') {

		const { r2Domain } = await settingService.query(c);
		const ossPrefix = domainUtils.toOssDomain(r2Domain);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const [imageOrdinal, img] of images.entries()) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				if (!isSafeInlineMimeType(normalizeMimeType(file.type))) {
					throw new BizError('Unsafe inline attachment type');
				}
				const buff = await file.arrayBuffer();
				const cid = sendKey
					? await fileUtils.getBuffHash(new TextEncoder().encode(`${sendKey}:${imageOrdinal}`))
					: uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			//邮件正文站内图片转cid附件
			if (src && ((ossPrefix && src.startsWith(ossPrefix + '/attachments/')) || src.startsWith('attachments/'))) {

				const cid = sendKey
					? await fileUtils.getBuffHash(new TextEncoder().encode(`${sendKey}:${imageOrdinal}`))
					: uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData = {};

				if (ossPrefix && src.startsWith(ossPrefix + '/attachments/')) {
					attData.key = src.slice(ossPrefix.length + 1);
				}

				if (src.startsWith('attachments/')) {
					attData.key = src;
				}

				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
				imageDataList.push(attData);

			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
		const dbImageList  = await this.selectOneByKeys(c, keys, userId);
		if (dbImageList.length !== keys.length) {
			throw new BizError('Attachment not found', 404);
		}

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) {
				return;
			}

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			if (!isSafeInlineMimeType(normalizeMimeType(image.mimeType))) {
				throw new BizError('Unsafe inline attachment type');
			}
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, image.key);
			if (!obj) {
				throw new BizError('Attachment not found', 404);
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId, operationId = '') {

		const attDataList = [];

		for (const [ordinal, att] of attList.entries()) {
			att.filename = normalizeAttachmentFilename(att.filename || 'attachment');
			att.type = normalizeMimeType(att.type || att.mimeType || att.contentType);
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId, sendOperationId: operationId, sendOrdinal: ordinal };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		if (operationId) {
			for (const row of attDataList) await orm(c).insert(att).values(row).onConflictDoNothing().run();
		} else {
			await orm(c).insert(att).values(attDataList).run();
		}

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: contentDisposition(att.filename)
			});
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId, operationId = '') {

		for (const [ordinal, attData] of attDataList.entries()) {
			attData.filename = normalizeAttachmentFilename(attData.filename || 'attachment');
			attData.mimeType = normalizeMimeType(attData.mimeType);
			if (attData.contentId && !isSafeInlineMimeType(attData.mimeType)) attData.contentId = null;
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			attData.sendOperationId = operationId;
			attData.sendOrdinal = ordinal;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: attData.contentId ? `max-age=259200` : 'private, no-store',
				contentDisposition: contentDisposition(attData.filename, Boolean(attData.contentId))
			});
			delete attData.buff;
		}

		if (operationId) {
			for (const row of attDataList) await orm(c).insert(att).values(row).onConflictDoNothing().run();
		} else {
			await orm(c).insert(att).values(attDataList).run();
		}

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	async removeAttByField(c, fieldName, fieldValues) {

		const sqlList = [];

		fieldValues.forEach(value => {

			sqlList.push(

				c.env.db.prepare(
					`SELECT a.key, a.att_id
						FROM attachments a
							   JOIN (SELECT key
									 FROM attachments
									 GROUP BY key
									 HAVING COUNT (*) = 1) t
									ON a.key = t.key
						WHERE a.${fieldName} = ?;`
					).bind(value)
			)

			sqlList.push(c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value))

		});

		const attListResult = await c.env.db.batch(sqlList);

		const delKeyList = attListResult.flatMap(r => r.results ? r.results.map(row => row.key) : []);

		if (delKeyList.length > 0) {
			try {
				await this.batchDelete(c, delKeyList);
			} catch (e) {
				console.error('删除附件文件失败：', e);
			}
		}

	},

	async batchDelete(c, keys) {
		if (!keys.length) return;
		// Service unit tests and one-off maintenance callers may intentionally
		// provide storage only. Production deletion always has D1 and therefore
		// takes the durable queue path below.
		if (!c.env.db) return r2Service.delete(c, keys);
		await storageCleanupService.enqueue(c, keys);
		await storageCleanupService.process(c);

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys(c, keys, userId) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select({ attachment: att }).from(att)
			.innerJoin(email, eq(att.emailId, email.emailId))
			.where(and(inArray(att.key, keys), eq(att.userId, userId), eq(email.userId, userId)))
			.orderBy(desc(att.attId)).all().then(rows =>
				[...new Map(rows.reverse().map(row => [row.attachment.key, row.attachment])).values()]);
	}
};

export default attService;
