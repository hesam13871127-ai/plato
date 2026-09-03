import { Currency, ItemRarity, ItemType } from '../database/enums';

/** Seeded shop catalogue (mirrors database/seed.sql). */
export interface ShopCatalogueItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: ItemRarity;
  price: number;
  currency: Currency;
  discountPercent: number;
  isUniqueOwned: boolean;
  giftable: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
}

export const SHOP_CATALOGUE: ShopCatalogueItem[] = [
  {
    id: '33333333-0000-4000-8100-000000000001',
    name: 'Neon Halo Frame',
    description: 'A glowing electric-purple halo.',
    type: 'avatar_frame',
    rarity: 'epic',
    price: 1500,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 10,
    metadata: { colors: ['#7B5CFF', '#00E5FF'], style: 'halo' },
  },
  {
    id: '33333333-0000-4000-8100-000000000002',
    name: 'Cyan Ring Frame',
    description: 'A crisp cyan rim.',
    type: 'avatar_frame',
    rarity: 'rare',
    price: 800,
    currency: 'coins',
    discountPercent: 10,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 11,
    metadata: { colors: ['#00E5FF'], style: 'ring' },
  },
  {
    id: '33333333-0000-4000-8200-000000000001',
    name: 'Aurora Banner',
    description: 'Shifting purple-cyan aurora.',
    type: 'banner',
    rarity: 'epic',
    price: 1200,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 20,
    metadata: { gradient: ['#7B5CFF', '#00E5FF'] },
  },
  {
    id: '33333333-0000-4000-8300-000000000001',
    name: 'Glass Bubble',
    description: 'Frosted glass chat bubble.',
    type: 'chat_bubble',
    rarity: 'rare',
    price: 900,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 30,
    metadata: { color: '#1AFFFFFF' },
  },
  {
    id: '33333333-0000-4000-8300-000000000003',
    name: 'Starter Bubble',
    description: 'A friendly little chat bubble.',
    type: 'chat_bubble',
    rarity: 'common',
    price: 300,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 29,
    metadata: { color: '#3300E5FF' },
  },
  {
    id: '33333333-0000-4000-8400-000000000001',
    name: 'Neon Night Theme',
    description: 'Purple & cyan interface theme.',
    type: 'theme',
    rarity: 'legendary',
    price: 300,
    currency: 'pips',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 40,
    metadata: { accent: '#7B5CFF' },
  },
  {
    id: '33333333-0000-4000-8500-000000000001',
    name: 'Neon Felt Table',
    description: 'Glowing purple table skin.',
    type: 'game_skin',
    rarity: 'epic',
    price: 1500,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 50,
    metadata: { felt: '#7B5CFF' },
  },
  {
    id: '33333333-0000-4000-8600-000000000002',
    name: 'Cyan ID Color',
    description: 'Soft-cyan username color.',
    type: 'id_color',
    rarity: 'rare',
    price: 1200,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: true,
    giftable: true,
    sortOrder: 61,
    metadata: { color: '#00E5FF' },
  },
  {
    id: '33333333-0000-4000-8700-000000000001',
    name: 'Username Change',
    description: 'Change your username once.',
    type: 'username_change',
    rarity: 'common',
    price: 500,
    currency: 'coins',
    discountPercent: 0,
    isUniqueOwned: false,
    giftable: false,
    sortOrder: 70,
    metadata: { service: 'rename' },
  },
];
