import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import utils from './utils';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';
import pMap from 'p-map';

export const route: Route = {
    path: '/paper/:type/:magazine',
    categories: ['journal'],
    example: '/x-mol/paper/0/9',
    parameters: { type: 'type', magazine: 'magazine' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Journal',
    maintainers: ['cssxsh'],
    handler,
};

async function handler(ctx) {
    const { type, magazine } = ctx.req.param();
    const path = `paper/${type}/${magazine}`;
    const link = new URL(path, utils.host).href;
    const response = await got(link, {
        headers: {
            Cookie: 'journalIndexViewType=grid',
        },
    });
    const data = response.data;
    const $ = load(data);

    const newsItem = $('.magazine-model-content-new li')
        .toArray()
        .slice(0, ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit'), 10) : 20)
        .map((item) => {
            item = $(item);
            return {
                title: item.find('.magazine-text-title a').text().trim(),
                link: new URL(item.find('.magazine-model-btn a').first().attr('href'), utils.host).href,
                pubDate: timezone(
                    parseDate(
                        item
                            .find('.magazine-text-atten')
                            .text()
                            .match(/\d{4}-\d{2}-\d{2}/)[0],
                        8
                    )
                ),
            };
        });

    const item = await pMap(
        newsItem,
        (element) =>
            cache.tryGet(element.link, async () => {
                const response = await got(element.link);
                const $ = load(response.data);

                const description = $('.maga-content');
                element.doi = description.find('.itsmblue').eq(1).text().trim();

                description.find('.itgaryfirst').remove();
                description.find('span').eq(0).remove();
                element.author = description.find('span').eq(0).text().trim();
                description.find('span').eq(0).remove();

                element.description = description.html();

                return element;
            }),
        { concurrency: 2 }
    );

    return {
        title: $('title').text(),
        link: response.url,
        description: $('meta[name="description"]').attr('content'),
        item,
    };
}
