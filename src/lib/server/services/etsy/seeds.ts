/**
 * Cron seed categories + keywords (Engineer F owns, spec §5.2).
 *
 * The popular Etsy categories the FE implies. Each → ~22-26 seed keywords. The daily cron
 * (refresh.ts) pre-builds trends + best-sellers for these so user requests are cache reads.
 * `taxonomyId` aligns with the fixture taxonomy where known; null is fine (used for cache keys
 * and category-relative REVIEW_RATE — estimation defaults when unknown). Calibratable.
 *
 * SIZING (per research-cron invocation, Cloudflare 1000-subrequest cap):
 *   trends      = 1 Etsy call / keyword            (scales with KEYWORD count)
 *   bestsellers = ~43 Etsy calls / category        (3 lead searches + 20 shops × 2; scales with CATEGORIES)
 * Cron is SPLIT into two half-invocations (each with its own 1000-subrequest cap):
 *   Half A (30 0 * * *): trends (~528 calls) + taxonomy (~10) ≈ 538 subrequests
 *   Half B (45 0 * * *): best-sellers: 19 cats × 43 ≈ 817 subrequests (< 1000)
 * Hard cap for Half B: floor(1000/43) = 23 categories max.
 * Expanded 121→356 keywords on 2026-06-23; 10→20 shops + 1→3 lead keywords on 2026-06-25.
 * 2026-07-02: +71 long-tail seeds into Ceramics & Pottery (branch A) + new 'Pottery Molds & Tools'
 *   category (branch B, 31 kw) for niche discovery → 528 keywords, 19 categories.
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
      'gold hoop earrings', 'engraved ring', 'stud earrings', 'charm bracelet',
      'signet ring', 'pearl earrings', 'layered necklace', 'anklet',
      'mens bracelet', 'locket necklace', 'stacking rings', 'friendship bracelet',
      'huggie earrings', 'coordinates necklace', 'zodiac necklace', 'custom name ring',
      'beaded bracelet', 'threader earrings',
    ],
  },
  {
    // Name matches the FE dropdown label exactly so the per-category cache key resolves.
    name: 'Home Decor',
    taxonomyId: 891,
    keywords: [
      'cottagecore decor', 'wall art print', 'macrame wall hanging', 'personalized doormat',
      'ceramic mug', 'throw pillow cover', 'wooden sign', 'boho tapestry',
      'kitchen towel', 'plant hanger', 'framed print', 'decorative tray',
      'wall shelf', 'faux plant', 'table runner', 'mirror decor',
      'neon sign', 'photo frame', 'area rug', 'ceramic vase',
      'reed diffuser', 'wall clock', 'knit blanket', 'coasters set',
      'candle holder set', 'welcome sign',
    ],
  },
  {
    name: 'Digital Downloads',
    taxonomyId: null,
    keywords: [
      'digital planner', 'printable wall art', 'budget planner', 'svg files',
      'procreate brushes', 'resume template', 'wedding invitation template', 'sublimation design',
      'coloring pages', 'social media templates', 'png clipart', 'font bundle',
      'business card template', 'lightroom presets', 'ebook template', 'digital stickers',
      'planner inserts', 'cricut designs', 'invoice template', 'printable tarot cards',
      'chore chart printable', 'meal planner printable', 'instagram templates', 'notion template',
      'kdp interior', 'seamless pattern',
    ],
  },
  {
    name: 'Art',
    taxonomyId: null,
    keywords: [
      'custom pet portrait', 'resin art', 'abstract painting', 'watercolor print',
      'line art print', 'family portrait', 'landscape painting', 'minimalist art',
      'custom illustration', 'nursery art', 'oil painting', 'canvas print',
      'digital portrait', 'pop art portrait', 'couple portrait', 'botanical print',
      'map print', 'motivational poster', 'custom house portrait', 'faceless portrait',
      'wedding portrait', 'vintage poster', 'typography print', 'animal print',
    ],
  },
  {
    name: 'Clothing',
    taxonomyId: null,
    keywords: [
      'vintage clothing', 'custom t shirt', 'embroidered sweatshirt', 'baby onesie',
      'tie dye hoodie', 'graphic tee', 'linen dress', 'custom hat',
      'matching family shirts', 'crochet top', 'oversized tee', 'mama sweatshirt',
      'couples shirts', 'band tshirt', 'flannel shirt', 'knit sweater',
      'denim jacket', 'custom hoodie', 'funny shirt', 'maternity shirt',
      'embroidered hat', 'crewneck sweatshirt', 'halloween shirt', 'bachelorette shirts',
      'teacher shirt', 'christmas sweater',
    ],
  },
  {
    name: 'Party Supplies',
    taxonomyId: null,
    keywords: [
      'baby shower favors', 'birthday banner', 'party decorations', 'custom cake topper',
      'wedding favors', 'bachelorette party', 'balloon garland', 'gender reveal',
      'personalized cup', 'party invitation', 'cupcake toppers', 'photo booth props',
      'party hats', 'confetti', 'table centerpiece', 'custom napkins',
      'birthday sash', 'party favor bags', 'backdrop banner', 'custom balloon',
      'party plates', 'birthday crown',
    ],
  },
  {
    name: 'Stickers',
    taxonomyId: null,
    keywords: [
      'sticker sheets', 'planner stickers', 'laptop stickers', 'vinyl stickers',
      'kiss cut stickers', 'water bottle stickers', 'aesthetic stickers', 'die cut stickers',
      'holographic stickers', 'custom stickers', 'bumper sticker', 'name labels',
      'wall decals', 'car decals', 'phone stickers', 'sticker bundle',
      'waterproof stickers', 'funny stickers', 'sticker pack', 'logo stickers',
      'envelope seals', 'packaging stickers',
    ],
  },
  {
    name: 'Craft Supplies',
    taxonomyId: 66,
    keywords: [
      'crochet patterns', 'knitting pattern', 'beads bulk', 'jewelry findings',
      'fabric bundle', 'embroidery kit', 'yarn skein', 'cross stitch pattern',
      'polymer clay', 'craft kit', 'sewing pattern', 'macrame cord',
      'wood beads', 'resin molds', 'felt sheets', 'ribbon bulk',
      'charms bulk', 'fabric fat quarters', 'knitting needles', 'diamond painting kit',
      'amigurumi pattern', 'punch needle kit', 'candle wicks', 'leather scraps',
    ],
  },
  {
    name: 'Wedding',
    taxonomyId: null,
    keywords: [
      'wedding invitation', 'bridal shower gift', 'wedding guest book', 'bridesmaid proposal box',
      'wedding cake topper', 'wedding signs', 'save the date', 'wedding garter',
      'ring bearer pillow', 'personalized wedding gift', 'wedding seating chart', 'bridal robe',
      'flower girl dress', 'vow books', 'cake stand', 'wedding hair piece',
      'groomsmen gifts', 'wedding welcome bag', 'bridesmaid robes', 'wedding veil',
      'table numbers', 'unity candle', 'ring box', 'wedding favors guests',
    ],
  },
  {
    name: 'Candles',
    taxonomyId: null,
    keywords: [
      'soy candle', 'scented candle', 'personalized candle', 'candle gift set',
      'wood wick candle', 'candle making kit', 'votive candles', 'beeswax candle',
      'aromatherapy candle', 'birthday candle', 'funny candle', 'travel tin candle',
      'candle warmer', 'pillar candle', 'citronella candle', 'coconut wax candle',
      'candle gift box', 'massage candle', 'ritual candle', 'container candle',
      'soy wax melts', 'candle wick trimmer',
    ],
  },
  {
    name: 'Bags & Purses',
    taxonomyId: null,
    keywords: [
      'tote bag', 'crossbody bag', 'leather purse', 'canvas tote',
      'makeup bag', 'clutch purse', 'personalized tote bag', 'wallet',
      'laptop bag', 'crochet bag', 'bucket bag', 'diaper bag',
      'weekender bag', 'coin purse', 'backpack', 'fanny pack',
      'wristlet', 'beach bag', 'quilted bag', 'phone crossbody bag',
      'card holder', 'knitting project bag',
    ],
  },
  {
    name: 'Bath & Beauty',
    taxonomyId: null,
    keywords: [
      'bath bombs', 'sugar scrub', 'soap bar', 'lip balm',
      'body butter', 'beard oil', 'bath salts', 'shampoo bar',
      'face serum', 'perfume oil', 'body oil', 'bath gift set',
      'natural deodorant', 'facial roller', 'whipped soap', 'foot soak',
      'lip gloss', 'body scrub', 'bath gift box', 'solid lotion',
      'bath teas', 'hair oil',
    ],
  },
  {
    name: 'Pet Supplies',
    taxonomyId: null,
    keywords: [
      'personalized dog collar', 'dog bandana', 'cat toys', 'pet bed',
      'dog tag', 'custom pet bowl', 'dog leash', 'pet portrait',
      'cat collar', 'dog bow tie', 'pet memorial gift', 'dog treats',
      'catnip toys', 'dog harness', 'dog sweater', 'cat bed',
      'pet id tag', 'dog toy', 'custom dog leash', 'pet feeding mat',
      'dog birthday bandana', 'cat scratcher',
    ],
  },
  {
    name: 'Seasonal & Holiday',
    taxonomyId: null,
    keywords: [
      'christmas ornament', 'christmas stocking', 'advent calendar', 'halloween decor',
      'christmas gift', 'personalized ornament', 'christmas card', 'valentines gift',
      'easter basket', 'thanksgiving decor', 'christmas tree skirt', 'santa sack',
      'christmas pajamas', 'holiday wreath', 'mothers day gift', 'fathers day gift',
      'fall decor', 'pumpkin decor', 'christmas gift tags', 'stocking stuffers',
      'easter gift', 'halloween costume', 'gingerbread decor', 'new year decor',
    ],
  },
  {
    name: 'Personalized Gifts',
    taxonomyId: null,
    keywords: [
      'personalized gift', 'custom portrait', 'engraved cutting board', 'personalized blanket',
      'custom keychain', 'photo gift', 'monogram gift', 'custom mug',
      'name sign', 'personalized wallet', 'engraved flask', 'family name sign',
      'custom socks', 'personalized journal', 'photo ornament', 'custom map print',
      'anniversary gift', 'custom star map', 'engraved watch', 'personalized photo frame',
      'custom night light', 'personalized water bottle', 'retirement gift', 'couple gift',
    ],
  },
  {
    name: 'Ceramics & Pottery',
    taxonomyId: null,
    keywords: [
      'handmade pottery', 'ceramic mug', 'pottery bowl', 'stoneware mug',
      'ceramic bowl', 'ceramic planter', 'handmade mug', 'pottery mug',
      'ceramic vase', 'stoneware bowl', 'ceramic earrings', 'clay jewelry',
      'ceramic pendant', 'pottery plate', 'ceramic dish', 'handmade ceramics',
      'ceramic ring dish', 'pottery vase', 'clay earrings', 'stoneware plate',
      'ceramic sculpture', 'pottery set', 'ceramic cup', 'ceramic mold',
      'pottery tools', 'clay tools',
      // ── Long-tail niche seeds (branch A: slip-cast finished products), added 2026-07-02.
      //    Deliberately avoids the head-terms above; targets form × style × function combos where
      //    whitespace still lives (see docs/niche-discovery-methodology.md).
      // Vases (moldable)
      'bud vase', 'ceramic bud vase', 'bud vase set', 'fluted bud vase',
      'ribbed bud vase', 'matte black vase', 'wabi sabi vase', 'brutalist vase',
      'organic modern vase', 'bulb vase', 'propagation vase', 'scalloped vase',
      // Planters
      'small ceramic planter', 'hanging ceramic planter', 'self watering planter', 'propagation planter',
      'mushroom planter', 'face planter', 'minimalist planter', 'scalloped planter',
      'ribbed planter', 'ceramic pot with drainage',
      // Dish / tray / catchall
      'trinket dish', 'ring dish', 'jewelry dish', 'catchall dish',
      'scalloped trinket dish', 'checkerboard trinket dish', 'wavy dish', 'spoon rest',
      'soap dish', 'butter dish', 'olive dish', 'ring holder dish',
      // Drinkware (differentiated, not "ceramic mug/cup")
      'espresso cup', 'cortado cup', 'matcha bowl', 'chawan',
      'ceramic tumbler', 'ribbed mug', 'fluted mug', 'speckled mug',
      'wabi sabi mug', 'latte mug', 'pinch pot cup', 'handmade coffee mug set',
      // Incense / candle / burners
      'incense holder', 'cone incense holder', 'ceramic incense holder', 'incense burner',
      'oil burner', 'wax warmer ceramic', 'ceramic candle holder', 'taper candle holder',
      'ceramic tealight holder', 'candle vessel ceramic',
      // Decor / figurine / ornament
      'ceramic ornament', 'ceramic bell', 'ceramic figurine', 'ceramic mushroom',
      'ceramic wall hook', 'ceramic wall art', 'hanging ceramic ornament', 'mini ceramic figurine',
      // Style-led cross terms (aesthetic is the real differentiator)
      'wabi sabi ceramics', 'brutalist ceramics', 'cottagecore ceramics', 'japandi ceramics',
      'organic modern ceramics', 'speckled ceramics', 'matte ceramics',
    ],
  },
  {
    // Branch B (molds & tools) — dedicated category so best-sellers ALSO covers the mold segment
    // (its first 3 keywords become the shop-discovery leads). Added 2026-07-02.
    name: 'Pottery Molds & Tools',
    taxonomyId: null,
    keywords: [
      // Mold type × output form
      'slip casting mold', 'plaster mold pottery', 'silicone mold pottery', 'press mold',
      'hump mold', 'slump mold', 'sprig mold', 'drape mold',
      'bisque mold', 'slip casting mug mold', 'plaster planter mold', 'press mold dish',
      'silicone bead mold', 'sprig mold botanical', 'bowl slump mold', 'ornament mold ceramic',
      'mug mold pottery',
      // Tools / stamps / texture
      'pottery stamp', 'clay stamp', 'clay texture roller', 'texture mat pottery',
      'pottery rib tool', 'clay cutter', 'pottery trimming tool', 'sgraffito tool',
      'clay texture stamp', 'pottery sponge',
      // DIY intent
      'diy pottery kit', 'pottery mold for beginners', 'reusable slip casting mold', 'clay mold kit',
    ],
  },
  {
    name: 'Pet Urns & Memorials',
    taxonomyId: null,
    keywords: [
      'pet urn', 'dog urn', 'cat urn', 'custom pet urn',
      'pet cremation urn', 'pet memorial box', 'pet loss gift', 'memorial urn',
      'pet keepsake', 'dog memorial gift', 'cat memorial gift', 'personalized pet urn',
      'small pet urn', 'pet ashes urn', 'pet memory box', 'rainbow bridge gift',
      'pet remembrance gift', 'loss of dog gift', 'loss of cat gift', 'pet sympathy gift',
      'pet memorial stone', 'pet portrait memorial',
    ],
  },
  {
    name: '3D Printed Products',
    taxonomyId: null,
    keywords: [
      '3d printed gift', 'custom 3d print', '3d printed decor', '3d printed jewelry',
      '3d printed planter', '3d printed figurine', '3d printed miniature', '3d printed keychain',
      '3d printed vase', '3d printed organizer', '3d printed toy', '3d printed phone stand',
      '3d printed dragon', '3d printed flower pot', '3d printed lamp', '3d printed sign',
      '3d printed ring', '3d printed earrings', '3d printed succulent', 'custom 3d figurine',
      '3d printed storage', '3d printed gadget',
    ],
  },
];
