/**
 * seo.js — per-route document metadata for a single-page app.
 *
 * server.js serves the same index.html for every route, so without this every
 * page would inherit the homepage's <title>, description, canonical URL and
 * Open Graph tags — including individual blog articles, which are exactly the
 * pages that need their own. This hook rewrites those tags on mount and
 * restores the homepage defaults on unmount.
 *
 * Tags are mutated in place (querySelector + setAttribute) rather than being
 * appended, so the values react-snap prerendered into dist/index.html get
 * updated instead of duplicated.
 *
 * Note this only helps crawlers that execute JavaScript (Googlebot does).
 * react-snap prerenders "/" and "/blog" at build time, so those two ship
 * correct metadata in the raw HTML; article routes are dynamic (DB-backed) and
 * rely on this hook.
 */

import { useEffect } from 'react'

const SITE_NAME = 'بيت المقدس للخدمات العامة'
const ORIGIN    = 'https://gs.bmexpress.co'

const DEFAULTS = {
  title: 'بيت المقدس للخدمات العامة | معاملات رسمية للفلسطينيين في الخارج',
  description: 'بيت المقدس في رام الله — الوجهة الأولى للفلسطينيين في الخارج لإنجاز معاملاتهم الرسمية.',
  path: '/',
  type: 'website',
  image: `${ORIGIN}/logo-white.png`,
}

// Sets an attribute on an existing tag, creating the tag only if it's absent.
function setTag(selector, create, attr, value) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

function setMetaName(name, content) {
  setTag(`meta[name="${name}"]`, () => {
    const m = document.createElement('meta'); m.setAttribute('name', name); return m
  }, 'content', content)
}

function setMetaProp(property, content) {
  setTag(`meta[property="${property}"]`, () => {
    const m = document.createElement('meta'); m.setAttribute('property', property); return m
  }, 'content', content)
}

function setCanonical(href) {
  setTag('link[rel="canonical"]', () => {
    const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l
  }, 'href', href)
}

// JSON-LD injected per-route lives in its own tagged <script> so it can be
// removed cleanly on unmount without touching the site-wide graph in index.html.
const ROUTE_LD_ID = 'route-jsonld'
function setRouteJsonLd(data) {
  document.getElementById(ROUTE_LD_ID)?.remove()
  if (!data) return
  const s = document.createElement('script')
  s.type = 'application/ld+json'
  s.id = ROUTE_LD_ID
  s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
}

const ROBOTS_INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1'

function apply({ title, description, path, type, image, jsonLd, noindex }) {
  const url = `${ORIGIN}${path}`
  document.title = title
  setMetaName('description', description)
  // The SPA answers unknown paths with index.html and a 200, so the 404 view must
  // opt itself out explicitly or those soft-404s get indexed as duplicates.
  setMetaName('robots', noindex ? 'noindex, follow' : ROBOTS_INDEXABLE)
  setCanonical(url)
  setMetaProp('og:title', title)
  setMetaProp('og:description', description)
  setMetaProp('og:url', url)
  setMetaProp('og:type', type)
  setMetaProp('og:image', image)
  setMetaProp('og:site_name', SITE_NAME)
  setMetaName('twitter:title', title)
  setMetaName('twitter:description', description)
  setMetaName('twitter:image', image)
  setRouteJsonLd(jsonLd)
}

/**
 * @param {object} opts
 * @param {string}  opts.title        full <title>, already including the brand suffix
 * @param {string}  opts.description  meta description (~155 chars reads best)
 * @param {string}  opts.path         path only, e.g. '/blog/my-article'
 * @param {string} [opts.type]        og:type — 'website' (default) or 'article'
 * @param {string} [opts.image]       absolute og:image URL
 * @param {object} [opts.jsonLd]      route-scoped schema.org object
 * @param {boolean} [opts.ready]      skip while data is still loading, so a
 *                                    half-populated title is never written
 */
export function useSeo({ title, description, path, type, image, jsonLd, ready = true, noindex = false }) {
  // jsonLd is an object literal at most call sites, so it's serialized for the
  // dependency list — otherwise a fresh identity each render would re-run this
  // effect on every render.
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : ''
  useEffect(() => {
    if (!ready) return undefined
    apply({
      title:       title       || DEFAULTS.title,
      description: description || DEFAULTS.description,
      path:        path        || DEFAULTS.path,
      type:        type        || DEFAULTS.type,
      image:       image       || DEFAULTS.image,
      jsonLd:      jsonLdKey ? JSON.parse(jsonLdKey) : null,
      noindex,
    })
    // Restore homepage defaults when leaving the route, so a client-side
    // navigation away from an article doesn't leave its title/canonical behind.
    return () => apply(DEFAULTS)
  }, [title, description, path, type, image, jsonLdKey, ready, noindex])
}

export { ORIGIN, SITE_NAME }
