import 'dotenv/config.js';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

export interface ListingRecord {
    source: string;
    url: string;
    title: string;
    price: string;
    city: string;
    address: string;
    areaSqm: string | number | null;
    bedrooms: string | number | null;
    bathrooms: string | number | null;
    type: string | null;
    imageUrls: string[];
    scrapedAt: string;
}

let cachedClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
    if (cachedClient) return cachedClient;

    // Read from environment variables; on Apify use Secrets to inject these
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cachedClient;
}

const TABLE_NAME = process.env.SUPABASE_TABLE ?? 'bazaraki_rent_apartments';

export async function upsertListing(records: ListingRecord[]): Promise<void> {
    if (records.length === 0) return;

    const client = getSupabaseClient();

    // Map records to rows, using a Map to deduplicate by ID (URL-based)
    const rowsMap = new Map();

    for (const record of records) {
        const id = Buffer.from(record.url).toString('base64');
        rowsMap.set(id, {
            id,
            source: record.source,
            url: record.url,
            title: record.title,
            price: record.price,
            city: record.city || null,
            address: record.address || null,
            area_sqm: coerceNumber(record.areaSqm),
            bedrooms: coerceNumber(record.bedrooms),
            bathrooms: coerceNumber(record.bathrooms),
            type: record.type ?? null,
            image_urls: record.imageUrls,
            scraped_at: record.scrapedAt,
        });
    }

    const rows = Array.from(rowsMap.values());
    console.log(`Upserting ${rows.length} listings to Supabase...`);

    const { error } = await client.from(TABLE_NAME).upsert(rows, { onConflict: 'url' });

    if (error) {
        console.error('Error upserting listings:', error);
        throw error;
    }

    console.log(`Successfully upserted ${rows.length} listings.`);
}

function coerceNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const match = value.replace(/[,\s]/g, '').match(/\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
    }
    return null;
}
