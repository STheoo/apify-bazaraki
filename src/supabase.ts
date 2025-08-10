import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

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
    const client = getSupabaseClient();

    // Normalize a deterministic id from URL
    const rows = records.map((record) => {
        const id = Buffer.from(record.url).toString('base64');
        return {
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
        };
    });

    // De-duplicate rows by id within the same batch to avoid Postgres 21000
    const uniqueById = new Map<string, (typeof rows)[number]>();
    for (const row of rows) uniqueById.set(row.id, row);
    const dedupedRows = Array.from(uniqueById.values());

    const { error } = await client.from(TABLE_NAME).upsert(dedupedRows, { onConflict: 'id' });
    if (error) throw error;
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
