import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const countries = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/countries' }),
  schema: z.object({
    name: z.string(),
    iso2: z.string().length(2),
    capital: z.string(),
    region: z.string(),
    citizenshipByDescent: z.boolean(),
    naturalizationYears: z.number().nullable(),
    dualCitizenshipAllowed: z.boolean(),
    officialFeeEUR: z.number().nullable(),
    summary: z.string(),
  }),
});

export const collections = { countries };
