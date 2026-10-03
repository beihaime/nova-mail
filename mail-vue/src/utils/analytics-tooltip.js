// ECharts must render this as rich text, never as HTML: sender names arrive
// unchanged from incoming mail headers.
export function formatSenderTooltip(params) {
  const name = String(params?.name ?? '')
  const count = Number(params?.value) || 0
  const percent = Number(params?.percent) || 0
  return `${name}： ${count} (${percent}%)`
}

export const senderTooltipRendering = Object.freeze({
  renderMode: 'richText',
  formatter: formatSenderTooltip,
})
