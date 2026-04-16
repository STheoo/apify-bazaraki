import { createPuppeteerRouter, log } from 'crawlee';
import type { Page } from 'puppeteer';

import { type ListingRecord, upsertListing } from './supabase.js';


export const router = createPuppeteerRouter();

async function extractListingRecordsFromPage(page: Page, request: { loadedUrl: string }): Promise<ListingRecord[]> {
    const listings = await page.$$('div.advert.js-item-listing.js-advert-click');
    const records: ListingRecord[] = [];

    for (let index = 0; index < listings.length; index++) {
        const listing = listings[index];
        let listingUrl = '';
        try {
            listingUrl = await listing.$eval('a.advert__content-title', (el) => (el as HTMLAnchorElement).href);
        } catch {
            console.error('Error extracting listing URL', { error: new Error().stack });
        }
        let title = '';
        try {
            title = await listing.$eval('a.advert__content-title', (el) => (el.textContent || '').trim());
        } catch {
            console.error('Error extracting listing title', { error: new Error().stack });
        }

        let priceTextRaw = '';
        try {
            priceTextRaw = await listing.$eval(
                'a.advert__content-price > span',
                (el) => (el.textContent || '').match(/(\d+(?:[.,]\d+)?)/)?.[0].replace(/[,.]/g, '') || '',
            );
        } catch {
            console.error('Error extracting listing price', { error: new Error().stack });
        }

        let bedroomsRaw = '';
        try {
            bedroomsRaw = await listing.$eval(
                'div.advert__content-feature > div[style*="/icons/9e229c1efb8b4fe791001ce5b11cf74d.png"] + div',
                (el) => (el.textContent || '').trim(),
            );
        } catch {
            console.error('Error extracting listing bedrooms', { error: new Error().stack });
        }
        const bedrooms = /^studio$/i.test(bedroomsRaw) ? '0' : bedroomsRaw;

        let areaSqm = '';
        try {
            areaSqm = await listing.$eval(
                'div.advert__content-feature > div[style*="/icons/b7a876dc4ffe47f0a65051a42cec9600.png"] + div',
                (el) => (el.textContent || '').trim(),
            );
        } catch {
            console.error('Error extracting listing areaSqm', { error: new Error().stack });
        }

        let bathrooms = '';
        try {
            bathrooms = await listing.$eval(
                'div.advert__content-feature > div[style*="/icons/4b964cf8af264cee81d0646a138d3679.png"] + div',
                (el) => (el.textContent || '').trim(),
            );
        } catch {
            console.error('Error extracting listing bathrooms', { error: new Error().stack });
        }

        let placeText = '';
        try {
            placeText = await listing.$eval('div.advert__content-place', (el) => (el.textContent || '').trim());
        } catch {
            console.error('Error extracting listing placeText', { error: new Error().stack });
        }
        const city = placeText ? placeText.split(',')[0]?.trim() : '';
        const address = placeText ? placeText.split(',')[1]?.trim() : '';
        const type = 'Apartment';
        const imageUrls = await listing.$$eval(
            'div.swiper-wrapper > a',
            (anchors) =>
                anchors.map((anchor) => anchor.getAttribute('data-background')?.trim()).filter(Boolean) as string[],
        );

        const record: ListingRecord = {
            source: 'bazaraki',
            url: listingUrl || `${request.loadedUrl}#pos=${index}`,
            title,
            price: priceTextRaw ?? '',
            address,
            city,
            areaSqm,
            bedrooms,
            imageUrls,
            bathrooms,
            type,
            scrapedAt: new Date().toISOString(),
        };
        records.push(record);
    }

    return records;
}

router.addDefaultHandler(async ({ request, page, enqueueLinks }) => {
    log.info('Processing list page', { url: request.loadedUrl });

    // Enqueue the "Next" page if present. Prefer rel="next" to avoid brittle text matching
    let nextUrl: string | null = null;
    try {
        nextUrl = await page.$eval('a.number-list-next', (a) => (a as HTMLAnchorElement).href);
    } catch {
        console.error('Error extracting next URL', { error: new Error().stack });
    }
    if (nextUrl) await enqueueLinks({ urls: [nextUrl], label: 'list' });

    const records = await extractListingRecordsFromPage(page, request);
    try {
        await upsertListing(records);
    } catch (error) {
        log.error('Error upserting listing', { error });
    }
});

router.addHandler('list', async ({ request, page, enqueueLinks }) => {
    log.info('Processing paginated list page', { url: request.loadedUrl });

    let nextUrl: string | null = null;
    try {
        nextUrl = await page.$eval('a.number-list-next', (a) => (a as HTMLAnchorElement).href);
    } catch {
        console.error('Error extracting next URL', { error: new Error().stack });
    }
    if (nextUrl) await enqueueLinks({ urls: [nextUrl], label: 'list' });

    const records = await extractListingRecordsFromPage(page, request);
    if (records.length > 0) {
        try {
            await upsertListing(records);
        } catch (error) {
            log.error('Error upserting listing', { error });
        }
    }
});
