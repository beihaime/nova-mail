import { describe, expect, it } from 'vitest'
import { formatSenderTooltip, senderTooltipRendering } from '../src/utils/analytics-tooltip.js'

describe('sender analytics tooltip', () => {
  it('uses ECharts text rendering for attacker-controlled sender names', () => {
    expect(senderTooltipRendering.renderMode).toBe('richText')
    expect(senderTooltipRendering.formatter).toBe(formatSenderTooltip)
    const malicious = '<img src=x onerror=window.__novaAuditXss=1>'
    const text = senderTooltipRendering.formatter({ name: malicious, value: 2, percent: 50 })
    expect(text).toContain(malicious)
    expect(text).not.toContain('<span')
    expect(text).not.toContain('undefined')
  })

  it('does not interpolate an ECharts HTML marker or untrusted numeric markup', () => {
    const text = formatSenderTooltip({
      name: 'Sender', marker: '<img src=x onerror=window.__novaAuditXss=1>',
      value: '<img src=x>', percent: '<svg onload=alert(1)>',
    })
    expect(text).toBe('Sender： 0 (0%)')
  })
})
