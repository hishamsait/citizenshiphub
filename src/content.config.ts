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
    // Phase 1: country profile (optional, from passports.json enrichment)
    flag: z.string().nullable().optional(),
    areaKm2: z.number().nullable().optional(),
    population: z.number().nullable().optional(),
    languages: z.array(z.string()).optional(),
    demonym: z.string().nullable().optional(),
    // Phase 4a: citizenship routes
    cbi: z.boolean().nullable().optional(),
    goldenVisa: z.boolean().nullable().optional(),
    marriageYears: z.number().nullable().optional(),
    languageRequired: z.boolean().nullable().optional(),
    maxGenerations: z.number().nullable().optional(),
    // Phase 5: residency & citizenship signals
    birthright: z.boolean().nullable().optional(),
    cbiMinInvestmentEUR: z.number().nullable().optional(),
    goldenVisaMinInvestmentEUR: z.number().nullable().optional(),
    digitalNomadVisa: z.boolean().nullable().optional(),
    languageLevel: z.string().nullable().optional(),
  }),
});

export const collections = { countries };
