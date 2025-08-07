import { createPuppeteerRouter, Dataset, log } from 'crawlee';

import { upsertListing } from './supabase.js';

export const router = createPuppeteerRouter();

// Listing index pages: enqueue all listing cards and pagination
router.addDefaultHandler(async ({ request, page, enqueueLinks }) => {
    log.info('Processing list page', { url: request.loadedUrl });

    // Enqueue detail links from listing cards
    await enqueueLinks({ selector: 'a.mask[href^="/adv/"]', label: 'detail' });

    // Enqueue the "Next" page if present. Prefer rel="next" to avoid brittle text matching
    let nextUrl: string | null = null;
    try {
        nextUrl = await page.$eval('a.number-list-next', (a) => (a as HTMLAnchorElement).href);
    } catch {}
    if (nextUrl) await enqueueLinks({ urls: [nextUrl], label: 'list' });
});

router.addHandler('list', async ({ request, page, enqueueLinks }) => {
    log.info('Processing paginated list page', { url: request.loadedUrl });
    await enqueueLinks({ selector: 'a.mask[href^="/adv/"]', label: 'detail' });

    let nextUrl: string | null = null;
    try {
        nextUrl = await page.$eval('a.number-list-next', (a) => (a as HTMLAnchorElement).href);
    } catch {}
    if (nextUrl) await enqueueLinks({ urls: [nextUrl], label: 'list' });
});

router.addHandler('detail', async ({ request, page }) => {
    const url = request.loadedUrl;

    // Extract as much as possible using selectors resilient to layout changes
    const title = await page.$eval('h1[itemprop="name"], h1', (el) => el.textContent?.trim() ?? '');
    // Extract price text and convert to the first number after €
    let priceText = await page
        .$eval(
            '.announcement-price div div, [itemprop="price"], .announcement__price__cost, .announcement__price',
            (el) => (el.textContent || '').replace(/\s+/g, ' ').trim(),
        )
        .catch(() => '');
    priceText = (priceText.match(/€\s*([0-9][0-9\s.,]*)/)?.[1] || '').replace(/[^\d]/g, '');

    const description = await page.$eval('.js-description', (el) => (el.textContent || '').trim()).catch(() => '');

    const imageUrls = await page
        .$$eval('img[src*="/photos/"], .swiper img, .announcement__gallery img, .js-gallery img', (imgs) =>
            Array.from(new Set(imgs.map((img) => (img as HTMLImageElement).src))).slice(0, 50),
        )
        .catch(() => [] as string[]);

    // Some common derived fields
    const cityRaw = await page.$eval('span[itemprop="address"]', (el) => (el.textContent || '').trim()).catch(() => '');
    const city = cityRaw.split(',')[0]?.trim() || '';
    const areaSqm = await page
        .evaluate(() => {
            // Find <li> that contains <span class="key-chars">Property area:</span>
            const spans = Array.from(document.querySelectorAll('li span.key-chars')) as HTMLElement[];
            for (const span of spans) {
                const label = (span.textContent || '').trim().toLowerCase();
                if (label === 'property area:' || label === 'property area') {
                    const li = span.closest('li');
                    if (li) {
                        const anchor = li.querySelector('a');
                        if (anchor) return (anchor.textContent || '').trim();
                    }
                }
            }
            return '';
        })
        .catch(() => '');
    const bedrooms = await page
        .evaluate(() => {
            const spans = Array.from(document.querySelectorAll('li span.key-chars')) as HTMLElement[];
            for (const span of spans) {
                const label = (span.textContent || '').trim().toLowerCase();
                if (label.includes('bedroom')) {
                    const li = span.closest('li');
                    if (li) {
                        const anchor = li.querySelector('a');
                        if (anchor) {
                            const text = (anchor.textContent || '').trim();
                            return /studio/i.test(text) ? '0' : text;
                        }
                    }
                }
            }
            return '';
        })
        .catch(() => '');

    const floor = await page
        .evaluate(() => {
            const spans = Array.from(document.querySelectorAll('li span.key-chars')) as HTMLElement[];
            for (const span of spans) {
                const label = (span.textContent || '').trim().toLowerCase();
                if (label.includes('floor:') || label === 'floor:') {
                    const li = span.closest('li');
                    if (li) {
                        const anchor = li.querySelector('a');
                        if (anchor) return (anchor.textContent || '').trim();
                    }
                }
            }
            return '';
        })
        .catch(() => '');

    const bathrooms = await page
        .evaluate(() => {
            const spans = Array.from(document.querySelectorAll('li span.key-chars')) as HTMLElement[];
            for (const span of spans) {
                const label = (span.textContent || '').trim().toLowerCase();
                if (label.includes('bathrooms:')) {
                    const li = span.closest('li');
                    if (li) {
                        const anchor = li.querySelector('a');
                        if (anchor) return (anchor.textContent || '').trim();
                    }
                }
            }
            return '';
        })
        .catch(() => '');

    const apartmentType = await page
        .evaluate(() => {
            const spans = Array.from(document.querySelectorAll('li span.key-chars')) as HTMLElement[];
            for (const span of spans) {
                const label = (span.textContent || '').trim().toLowerCase();
                if (label === 'type:' || label === 'type') {
                    const li = span.closest('li');
                    if (li) {
                        const value = li.querySelector('a');
                        if (value) return (value.textContent || '').trim();
                    }
                }
            }
            return '';
        })
        .catch(() => '');

    const record = {
        source: 'bazaraki',
        url,
        title,
        priceText,
        description,
        city,
        areaSqm,
        bedrooms,
        floor,
        imageUrls,
        bathrooms,
        apartmentType,
        scrapedAt: new Date().toISOString(),
    };

    // Persist to Supabase (best-effort)
    try {
        await upsertListing(record);
    } catch (e) {
        log.warning('Failed to upsert into Supabase', { error: (e as Error).message, url });
    }
});
