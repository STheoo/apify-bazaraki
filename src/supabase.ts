import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

export interface ListingRecord {
    source: string;
    url: string;
    title: string;
    priceText: string;
    description: string;
    city: string;
    areaSqm: string | number | null;
    bedrooms: string | number | null;
    floor: string | number | null;
    bathrooms: string | number | null;
    apartmentType: string | null;
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

export async function upsertListing(record: ListingRecord): Promise<void> {
    const client = getSupabaseClient();

    // Normalize a deterministic id from URL
    const id = Buffer.from(record.url).toString('base64');
    const row = {
        id,
        source: record.source,
        url: record.url,
        title: record.title,
        price_text: record.priceText,
        description: record.description,
        city: record.city || null,
        area_sqm: coerceNumber(record.areaSqm),
        bedrooms: coerceNumber(record.bedrooms),
        floor: coerceNumber(record.floor),
        bathrooms: coerceNumber(record.bathrooms),
        apartment_type: record.apartmentType ?? null,
        image_urls: record.imageUrls,
        scraped_at: record.scrapedAt,
    };

    const { error } = await client.from(TABLE_NAME).upsert(row, { onConflict: 'id' });
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
