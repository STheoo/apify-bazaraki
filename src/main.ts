// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import 'dotenv/config.js';

import { Actor } from 'apify';
// Web scraping and browser automation library (Read more at https://crawlee.dev)
import { PuppeteerCrawler, RequestQueue } from 'crawlee';

import { router } from './routes.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
    startUrls: {
        url: string;
        method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';
        headers?: Record<string, string>;
        userData: Record<string, unknown>;
    }[];
}
// Define the URLs to start the crawler with - get them from the input of the Actor or use a default list.
const { startUrls = ['https://www.bazaraki.com/real-estate-to-rent/apartments-flats/'] } =
    (await Actor.getInput<Input>()) ?? {};

// Open and drop the queue to ensure a clean start
const oldQueue = await RequestQueue.open('bazaraki');
await oldQueue.drop();

// Open a shared request queue so multiple crawlers can work in parallel without duplicating work
const requestQueue = await RequestQueue.open('bazaraki');

// Normalize input: accept both string URLs and objects with extra options, but seed queue with plain strings
const startRequests: string[] = (startUrls as { url: string }[]).map((entry) =>
    typeof entry === 'string' ? entry : (entry?.url as string),
);

// Seed the queue
await requestQueue.addRequests(startRequests);

// Create a proxy configuration that will rotate proxies from Apify Proxy.
// const proxyConfiguration = await Actor.createProxyConfiguration();

// Create four PuppeteerCrawlers that share the same queue and run in parallel
const crawlerA = new PuppeteerCrawler({
    requestQueue,
    requestHandler: router,
    // Give pages a bit more time and memory; Bazaraki pages can be media-heavy
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 2,
    // Tune per-crawler concurrency as needed
    maxConcurrency: 3,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
});

const crawlerB = new PuppeteerCrawler({
    requestQueue,
    requestHandler: router,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 2,
    maxConcurrency: 3,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
});

const crawlerC = new PuppeteerCrawler({
    requestQueue,
    requestHandler: router,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 2,
    maxConcurrency: 3,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
});

const crawlerD = new PuppeteerCrawler({
    requestQueue,
    requestHandler: router,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 2,
    maxConcurrency: 3,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
});

// Run all crawlers concurrently; they will consume from the same queue
await Promise.all([crawlerA.run(), crawlerB.run(), crawlerC.run(), crawlerD.run()]);

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();
