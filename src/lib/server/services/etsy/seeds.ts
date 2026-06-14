/**
 * Cron seed categories + keywords (Engineer F owns, spec §5.2).
 *
 * The popular Etsy categories the FE implies. Each → ~10 seed keywords. The weekly cron
 * (refresh.ts) pre-builds trends + best-sellers for these so user requests are cache reads.
 * `taxonomyId` aligns with the fixture taxonomy where known; null is fine (used for cache keys
 * and category-relative REVIEW_RATE — estimation defaults when unknown). Calibratable.
 */
export interface SeedCategory {
  name: string;
  taxonomyId: number | null;
  keywords: string[];
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Jewelry',
    taxonomyId: 1199,
    keywords: [
      'personalized necklace', 'name necklace', 'birthstone necklace', 'custom necklace',
      'minimalist jewelry', 'bridesmaid jewelry', 'dainty bracelet', 'initial necklace',
      'gold hoop earrings', 'engraved ring',
    ],
  },
  {
    name: 'Home & Living',
    taxonomyId: 891,
    keywords: [
      'cottagecore decor', 'wall art print', 'macrame wall hanging', 'personalized doormat',
      'ceramic mug', 'throw pillow cover', 'wooden sign', 'boho tapestry',
      'kitchen towel', 'plant hanger',
    ],
  },
  {
    name: 'Digital Downloads',
    taxonomyId: null,
    keywords: [
      'digital planner', 'printable wall art', 'budget planner', 'svg files',
      'procreate brushes', 'resume template', 'wedding invitation template', 'sublimation design',
      'coloring pages', 'social media templates',
    ],
  },
  {
    name: 'Art',
    taxonomyId: null,
    keywords: [
      'custom pet portrait', 'resin art', 'abstract painting', 'watercolor print',
      'line art print', 'family portrait', 'landscape painting', 'minimalist art',
      'custom illustration', 'nursery art',
    ],
  },
  {
    name: 'Clothing',
    taxonomyId: null,
    keywords: [
      'vintage clothing', 'custom t shirt', 'embroidered sweatshirt', 'baby onesie',
      'tie dye hoodie', 'graphic tee', 'linen dress', 'custom hat',
      'matching family shirts', 'crochet top',
    ],
  },
  {
    name: 'Party Supplies',
    taxonomyId: null,
    keywords: [
      'baby shower favors', 'birthday banner', 'party decorations', 'custom cake topper',
      'wedding favors', 'bachelorette party', 'balloon garland', 'gender reveal',
      'personalized cup', 'party invitation',
    ],
  },
  {
    name: 'Stickers',
    taxonomyId: null,
    keywords: [
      'sticker sheets', 'planner stickers', 'laptop stickers', 'vinyl stickers',
      'kiss cut stickers', 'water bottle stickers', 'aesthetic stickers', 'die cut stickers',
      'holographic stickers', 'custom stickers',
    ],
  },
  {
    name: 'Craft Supplies',
    taxonomyId: 66,
    keywords: [
      'crochet patterns', 'knitting pattern', 'beads bulk', 'jewelry findings',
      'fabric bundle', 'embroidery kit', 'yarn skein', 'cross stitch pattern',
      'polymer clay', 'craft kit',
    ],
  },
];
