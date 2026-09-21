const KvConst = {
	AUTH_INFO: 'auth-uid:',
	SETTING: 'setting:',
	SEND_DAY_COUNT: 'send_day_count:',
	ANALYSIS_ECHARTS: 'analysis_echarts:',
	PUBLIC_KEY: "public_key:",
	OAUTH_BIND: 'oauth-bind:',
	OAUTH_GITHUB_STATE: 'oauth-github-state:',
	OAUTH_GITHUB_COMPLETE: 'oauth-github-complete:',
	OAUTH_GOOGLE_STATE: 'oauth-google-state:',
	OAUTH_GOOGLE_COMPLETE: 'oauth-google-complete:',
	RATE_LIMIT: 'rate-limit:',
	// Sender-avatar resolver caches. One key space per provider so each can carry
	// its own TTL (local: long, BIMI: DNS TTL, Gravatar: hours–a day, domain: a
	// week) and so negative results can be cached without poisoning positives.
	AVATAR_RESULT: 'avatar-result:',
	AVATAR_ASSET: 'avatar-asset:',
	AVATAR_BIMI: 'avatar-bimi:'
}

export default KvConst;
