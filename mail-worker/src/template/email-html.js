import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';

/** Allow only safe CSS declarations in injected body style */
function sanitizeCss(style = '') {
	return String(style)
		.replace(/[<>`"']/g, '')
		.replace(/\\/g, '')
		.replace(/expression\s*\(/gi, '')
		.replace(/url\s*\(\s*['"]?\s*javascript:/gi, '')
		.replace(/@import/gi, '')
		slice(0, 2000);
}

function hardenDocument(document) {
	document.querySelectorAll('script, iframe, object, embed, link[rel="import"]').forEach(el => el.remove());

	document.querySelectorAll('*').forEach(el => {
		[...el.attributes].forEach(attr => {
			const name = attr.name.toLowerCase();
			const value = (attr.value || '').trim();
			if (name.startsWith('on')) {
				el.removeAttribute(attr.name);
				return;
			}
			if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) {
				el.removeAttribute(attr.name);
			}
		});
	});
}

export default function emailHtmlTemplate(html, domain) {

	const { document } = parseHTML(html || '');
	hardenDocument(document);
	html = document.toString();
	html = html.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	const safeHtmlJson = JSON.stringify(html).replace(/</g, '\\u003C');

	return `<!DOCTYPE html>
<html lang='en' >
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data: http:; font-src data:; script-src 'unsafe-inline'">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        .content-box {
        		padding: 15px 10px;
            width: 100%;
            height: 100%;
            overflow: auto;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .content-html {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div class='content-box'>
        <div id='container' class='content-html'></div>
    </div>

    <script>

        function sanitizeCss(style) {
            return String(style || '')
                .replace(/[<>\`"']/g, '')
                .replace(/\\\\/g, '')
                .replace(/expression\\s*\\(/gi, '')
                .replace(/url\\s*\\(\\s*['"]?\\s*javascript:/gi, '')
                .replace(/@import/gi, '')
                .slice(0, 2000);
        }

        function renderHTML(html) {
            const container = document.getElementById('container');
            const shadowRoot = container.attachShadow({ mode: 'open' });

            const bodyStyleRegex = /<body[^>]*style=\"([^\"]*)\"[^>]*>/i;
            const bodyStyleMatch = html.match(bodyStyleRegex);
            const bodyStyle = sanitizeCss(bodyStyleMatch ? bodyStyleMatch[1] : '');

            const cleanedHtml = html.replace(/<\\/?body[^>]*>/gi, '');

            shadowRoot.innerHTML = \`
                <style>
                    :host {
                        all: initial;
                        width: 100%;
                        height: 100%;
                        font-family: Inter, -apple-system, BlinkMacSystemFont,
                                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #13181D;
                        word-break: break-word;
                        overflow: auto;
                    }

                    h1, h2, h3, h4 {
                        font-size: 18px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0;
                    }

                    a {
                        text-decoration: none;
                        color: #0E70DF;
                    }

                    .shadow-content {
                        background: #FFFFFF;
                        width: fit-content;
                        height: fit-content;
                        min-width: 100%;
                        \${bodyStyle}
                    }

                    img:not(table img) {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                </style>
                <div class="shadow-content">
                    \${cleanedHtml}
                </div>
            \`;

            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {

            if (!shadowRoot || !container) return;

            const parent = container;
            const shadowContent = shadowRoot.querySelector('.shadow-content');

            if (!shadowContent) return;

            const parentWidth = parent.offsetWidth;
            const childWidth = shadowContent.scrollWidth;

            if (childWidth === 0) return;

            const scale = parentWidth / childWidth;

            const hostElement = shadowRoot.host;
            hostElement.style.zoom = scale;
        }

        const exampleHtml = ${safeHtmlJson};

        renderHTML(exampleHtml);
    </script>
</body>
</html>`
}
