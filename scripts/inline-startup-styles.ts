import type { Plugin } from 'vite';

/** 首屏样式随 HTML 下发，恢复提示不再等待另一次 CSS 请求。 */
export function inlineStartupStyles(html: string, styles: Record<string, string>): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) return tag;
    const path = href.replace(/^\.\//, '').replace(/^\//, '');
    const css = styles[path];
    if (css === undefined) throw new Error(`找不到首屏样式：${path}`);
    const directory = href.slice(0, href.lastIndexOf('/') + 1);
    // 内联后图片等相对地址要继续以原 CSS 文件所在目录解析。
    const rebased = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote: string, url: string) => {
      const value = url.trim();
      return /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)
        ? `url(${quote}${value}${quote})`
        : `url(${quote}${directory}${value}${quote})`;
    });
    return `<style data-bfu-startup-style>${rebased.replace(/<\/style/gi, '<\\/style')}</style>`;
  });
}

export function startupHtmlPlugin(): Plugin {
  return {
    name: 'bfu-startup-html',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const styles: Record<string, string> = {};
        for (const [name, asset] of Object.entries(bundle)) {
          if (asset.type === 'asset' && name.endsWith('.css')) {
            styles[name] = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source);
          }
        }
        const index = bundle['index.html'];
        if (index?.type !== 'asset') throw new Error('缺少应用首页，无法生成手机入口。');
        const html = typeof index.source === 'string' ? index.source : new TextDecoder().decode(index.source);
        index.source = inlineStartupStyles(html, styles);
        // 独立路径供旧首页缓存失效时恢复；内容与首页一致，所有功能继续共用。
        this.emitFile({ type: 'asset', fileName: 'mobile.html', source: index.source });
      },
    },
  };
}
