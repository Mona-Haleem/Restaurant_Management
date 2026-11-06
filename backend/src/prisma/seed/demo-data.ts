import type { InventoryItemType, Unit, UserRole } from '../../generated/prisma/enums';

/**
 * Demo content for B401 (stands in for the frontend's TABLZ-404 seed, which does not exist yet).
 * Plain data only: build-seed.ts turns it into rows, so the numbers here are the only thing to
 * edit when the demo changes. Prices are EGP; times are minutes before the seed's first run.
 */

export interface StageSeed {
  key: string;
  label: string;
  cancellable: boolean;
  deductsInventory: boolean;
}

export interface InventorySeed {
  key: string;
  name: string;
  type: InventoryItemType;
  unit: Unit;
  standardUnitCost?: string;
  lowStockThreshold?: string;
  /** MIXED only: quantity of each component per one unit of this item (ADR 0002). */
  components?: { item: string; quantity: string; unit: Unit }[];
}

export interface MenuSeed {
  key: string;
  category: string;
  name: string;
  description: string;
  price: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  recipe: { item: string; quantity: string; unit: Unit }[];
}

export type LedgerEventSeed =
  | {
      kind: 'purchase';
      key: string;
      item: string;
      quantity: string;
      unitCost: string;
      minutesAgo: number;
      note: string;
    }
  | {
      kind: 'waste';
      key: string;
      item: string;
      quantity: string;
      unit: Unit;
      reason: string;
      minutesAgo: number;
    }
  | { kind: 'count'; key: string; item: string; gap: string; minutesAgo: number; note: string };

export interface OrderSeed {
  key: string;
  placedBy: 'GUEST' | 'STAFF';
  placedMinutesAgo: number;
  /** One entry per stage moved forward, so the order's stage is stages[transitions.length]. */
  transitionsMinutesAgo: number[];
  canceledMinutesAgo?: number;
  items: [menuKey: string, quantity: number][];
  note?: string;
}

export interface TenantSeedDefinition {
  slug: string;
  name: string;
  timezone: string;
  isDemo: boolean;
  branch: { key: string; name: string };
  users: { key: string; name: string; email: string; role: UserRole }[];
  categories: { key: string; name: string }[];
  inventory: InventorySeed[];
  menu: MenuSeed[];
  events: LedgerEventSeed[];
  orders: OrderSeed[];
}

/** ADR 0009 defaults, seeded for every tenant. */
export const DEFAULT_STAGES: StageSeed[] = [
  { key: 'pending', label: 'Pending', cancellable: true, deductsInventory: false },
  { key: 'in-preparation', label: 'In Preparation', cancellable: false, deductsInventory: false },
  { key: 'ready', label: 'Ready', cancellable: false, deductsInventory: false },
  { key: 'delivered', label: 'Delivered', cancellable: false, deductsInventory: true },
];

/** How long ago the tenant, menu and inventory definitions were "set up". */
export const SETUP_MINUTES_AGO = 30 * 24 * 60;

const purchase = (
  item: string,
  quantity: string,
  unitCost: string,
  minutesAgo = 3 * 24 * 60,
  note = 'Weekly supplier delivery',
): LedgerEventSeed => ({
  kind: 'purchase',
  key: `${item}@${minutesAgo}`,
  item,
  quantity,
  unitCost,
  minutesAgo,
  note,
});

export const DEMO_TENANT: TenantSeedDefinition = {
  slug: 'nile-bites',
  name: 'Nile Bites',
  timezone: 'Africa/Cairo',
  isDemo: true,
  branch: { key: 'zamalek', name: 'Zamalek' },
  users: [
    { key: 'admin', name: 'Karim Fawzy', email: 'karim@nile-bites.example', role: 'ADMIN' },
    { key: 'manager', name: 'Salma Adel', email: 'salma@nile-bites.example', role: 'MANAGER' },
    { key: 'worker', name: 'Omar Hassan', email: 'omar@nile-bites.example', role: 'WORKER' },
  ],
  categories: [
    { key: 'burgers', name: 'Burgers' },
    { key: 'pizza', name: 'Pizza' },
    { key: 'grills', name: 'Grills & Rice' },
    { key: 'sides', name: 'Sides & Salads' },
    { key: 'drinks', name: 'Drinks' },
  ],
  inventory: [
    {
      key: 'beef',
      name: 'Beef Mince',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '420.00',
      lowStockThreshold: '5',
    },
    {
      key: 'chicken',
      name: 'Chicken Breast',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '210.00',
      lowStockThreshold: '4',
    },
    {
      key: 'tomatoes',
      name: 'Tomatoes',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '18.00',
      lowStockThreshold: '3',
    },
    {
      key: 'onions',
      name: 'Red Onions',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '12.00',
      lowStockThreshold: '2',
    },
    {
      key: 'garlic',
      name: 'Garlic',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '60.00',
      lowStockThreshold: '0.5',
    },
    {
      key: 'mozzarella',
      name: 'Mozzarella',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '380.00',
      lowStockThreshold: '2.5',
    },
    {
      key: 'flour',
      name: 'Pizza Flour',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '22.00',
      lowStockThreshold: '5',
    },
    {
      key: 'rice',
      name: 'Basmati Rice',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '65.00',
      lowStockThreshold: '4',
    },
    {
      key: 'potatoes',
      name: 'Potatoes',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '14.00',
      lowStockThreshold: '5',
    },
    {
      key: 'lemons',
      name: 'Lemons',
      type: 'RAW',
      unit: 'KG',
      standardUnitCost: '40.00',
      lowStockThreshold: '1',
    },
    {
      key: 'lettuce',
      name: 'Romaine Lettuce',
      type: 'RAW',
      unit: 'PCS',
      standardUnitCost: '15.00',
      lowStockThreshold: '3',
    },
    {
      key: 'cooking-oil',
      name: 'Sunflower Oil',
      type: 'RAW',
      unit: 'L',
      standardUnitCost: '85.00',
      lowStockThreshold: '1',
    },
    {
      key: 'burger-buns',
      name: 'Brioche Buns',
      type: 'READY',
      unit: 'PCS',
      standardUnitCost: '4.50',
      lowStockThreshold: '20',
    },
    {
      key: 'cola-can',
      name: 'Cola Can 330 ml',
      type: 'READY',
      unit: 'PCS',
      standardUnitCost: '12.00',
      lowStockThreshold: '24',
    },
    {
      key: 'water-bottle',
      name: 'Mineral Water 600 ml',
      type: 'READY',
      unit: 'PCS',
      standardUnitCost: '5.00',
      lowStockThreshold: '24',
    },
    {
      key: 'mayonnaise',
      name: 'Mayonnaise',
      type: 'READY',
      unit: 'KG',
      standardUnitCost: '95.00',
      lowStockThreshold: '1',
    },
    {
      key: 'tomato-sauce',
      name: 'House Tomato Sauce',
      type: 'MIXED',
      unit: 'L',
      components: [
        { item: 'tomatoes', quantity: '1.2', unit: 'KG' },
        { item: 'onions', quantity: '0.2', unit: 'KG' },
        { item: 'garlic', quantity: '0.025', unit: 'KG' },
        { item: 'cooking-oil', quantity: '0.05', unit: 'L' },
      ],
    },
    {
      key: 'garlic-sauce',
      name: 'Garlic Sauce (Toum)',
      type: 'MIXED',
      unit: 'L',
      components: [
        { item: 'garlic', quantity: '0.2', unit: 'KG' },
        { item: 'mayonnaise', quantity: '0.6', unit: 'KG' },
        { item: 'cooking-oil', quantity: '0.2', unit: 'L' },
        { item: 'lemons', quantity: '0.1', unit: 'KG' },
      ],
    },
  ],
  menu: [
    {
      key: 'classic-burger',
      category: 'burgers',
      name: 'Classic Beef Burger',
      description: '150 g beef patty, tomato, red onion and garlic sauce in a brioche bun.',
      price: '185.00',
      recipe: [
        { item: 'beef', quantity: '150', unit: 'G' },
        { item: 'burger-buns', quantity: '1', unit: 'PCS' },
        { item: 'tomatoes', quantity: '30', unit: 'G' },
        { item: 'onions', quantity: '20', unit: 'G' },
        { item: 'garlic-sauce', quantity: '30', unit: 'ML' },
      ],
    },
    {
      key: 'chicken-burger',
      category: 'burgers',
      name: 'Crispy Chicken Burger',
      description: 'Crumbed chicken breast, romaine and mayo.',
      price: '165.00',
      recipe: [
        { item: 'chicken', quantity: '160', unit: 'G' },
        { item: 'burger-buns', quantity: '1', unit: 'PCS' },
        { item: 'mayonnaise', quantity: '20', unit: 'G' },
        { item: 'lettuce', quantity: '0.1', unit: 'PCS' },
      ],
    },
    {
      key: 'double-cheese',
      category: 'burgers',
      name: 'Double Cheeseburger',
      description: 'Two beef patties, melted mozzarella and garlic sauce.',
      price: '245.00',
      recipe: [
        { item: 'beef', quantity: '300', unit: 'G' },
        { item: 'mozzarella', quantity: '60', unit: 'G' },
        { item: 'burger-buns', quantity: '1', unit: 'PCS' },
        { item: 'garlic-sauce', quantity: '30', unit: 'ML' },
      ],
    },
    {
      key: 'margherita',
      category: 'pizza',
      name: 'Margherita',
      description: 'House tomato sauce, mozzarella and a drizzle of oil.',
      price: '210.00',
      recipe: [
        { item: 'flour', quantity: '250', unit: 'G' },
        { item: 'tomato-sauce', quantity: '120', unit: 'ML' },
        { item: 'mozzarella', quantity: '150', unit: 'G' },
        { item: 'cooking-oil', quantity: '10', unit: 'ML' },
      ],
    },
    {
      key: 'spicy-beef-pizza',
      category: 'pizza',
      name: 'Spicy Beef Pizza',
      description: 'Spiced minced beef, red onion, mozzarella and tomato sauce.',
      price: '260.00',
      recipe: [
        { item: 'flour', quantity: '250', unit: 'G' },
        { item: 'tomato-sauce', quantity: '120', unit: 'ML' },
        { item: 'mozzarella', quantity: '120', unit: 'G' },
        { item: 'beef', quantity: '100', unit: 'G' },
        { item: 'onions', quantity: '30', unit: 'G' },
      ],
    },
    {
      key: 'shawarma-plate',
      category: 'grills',
      name: 'Chicken Shawarma Plate',
      description: 'Marinated chicken over basmati rice with toum and tomatoes.',
      price: '195.00',
      recipe: [
        { item: 'chicken', quantity: '220', unit: 'G' },
        { item: 'rice', quantity: '200', unit: 'G' },
        { item: 'garlic-sauce', quantity: '50', unit: 'ML' },
        { item: 'tomatoes', quantity: '50', unit: 'G' },
      ],
    },
    {
      key: 'kofta-rice',
      category: 'grills',
      name: 'Kofta with Rice',
      description: 'Grilled beef kofta skewers, rice and a tomato-onion salad.',
      price: '230.00',
      recipe: [
        { item: 'beef', quantity: '250', unit: 'G' },
        { item: 'rice', quantity: '200', unit: 'G' },
        { item: 'onions', quantity: '40', unit: 'G' },
        { item: 'tomatoes', quantity: '60', unit: 'G' },
      ],
    },
    {
      key: 'fries',
      category: 'sides',
      name: 'Hand-cut Fries',
      description: 'Double-fried potatoes with sea salt.',
      price: '55.00',
      recipe: [
        { item: 'potatoes', quantity: '250', unit: 'G' },
        { item: 'cooking-oil', quantity: '20', unit: 'ML' },
      ],
    },
    {
      key: 'garden-salad',
      category: 'sides',
      name: 'Garden Salad',
      description: 'Romaine, tomatoes and red onion with a lemon dressing.',
      price: '70.00',
      recipe: [
        { item: 'lettuce', quantity: '0.5', unit: 'PCS' },
        { item: 'tomatoes', quantity: '100', unit: 'G' },
        { item: 'onions', quantity: '20', unit: 'G' },
        { item: 'cooking-oil', quantity: '15', unit: 'ML' },
        { item: 'lemons', quantity: '20', unit: 'G' },
      ],
    },
    {
      key: 'cola',
      category: 'drinks',
      name: 'Cola',
      description: 'Chilled 330 ml can.',
      price: '30.00',
      recipe: [{ item: 'cola-can', quantity: '1', unit: 'PCS' }],
    },
    {
      key: 'water',
      category: 'drinks',
      name: 'Mineral Water',
      description: '600 ml bottle.',
      price: '15.00',
      recipe: [{ item: 'water-bottle', quantity: '1', unit: 'PCS' }],
    },
    {
      key: 'lemonade',
      category: 'drinks',
      name: 'Fresh Lemonade',
      description: 'Squeezed to order.',
      price: '45.00',
      recipe: [{ item: 'lemons', quantity: '150', unit: 'G' }],
    },
    {
      key: 'mango-juice',
      category: 'drinks',
      name: 'Seasonal Mango Juice',
      description: 'Back when mangoes are in season.',
      price: '60.00',
      status: 'ARCHIVED',
      recipe: [],
    },
  ],
  events: [
    purchase('beef', '20', '420.00'),
    purchase('chicken', '15', '210.00'),
    purchase('tomatoes', '12', '18.00'),
    purchase('onions', '10', '12.00'),
    purchase('garlic', '2', '60.00'),
    purchase('mozzarella', '3', '380.00'),
    purchase('flour', '25', '22.00'),
    purchase('rice', '15', '65.00'),
    purchase('potatoes', '20', '14.00'),
    purchase('lemons', '5', '40.00'),
    purchase('lettuce', '12', '15.00'),
    purchase('cooking-oil', '8', '85.00'),
    purchase('burger-buns', '60', '4.50'),
    purchase('cola-can', '96', '12.00'),
    purchase('water-bottle', '120', '5.00'),
    purchase('mayonnaise', '3', '95.00'),
    purchase('beef', '10', '440.00', 24 * 60, 'Top-up from the butcher'),
    {
      kind: 'waste',
      key: 'overripe-tomatoes',
      item: 'tomatoes',
      quantity: '600',
      unit: 'G',
      reason: 'Overripe, discarded at closing',
      minutesAgo: 1400,
    },
    {
      kind: 'count',
      key: 'tomatoes',
      item: 'tomatoes',
      gap: '-0.25',
      minutesAgo: 960,
      note: 'End-of-day count',
    },
    {
      kind: 'count',
      key: 'mozzarella',
      item: 'mozzarella',
      gap: '0',
      minutesAgo: 960,
      note: 'End-of-day count',
    },
    purchase('tomatoes', '5', '20.00', 300, 'Morning market run'),
  ],
  orders: [
    {
      key: 'o1',
      placedBy: 'GUEST',
      placedMinutesAgo: 1580,
      transitionsMinutesAgo: [1574, 1562, 1556],
      items: [
        ['classic-burger', 2],
        ['fries', 2],
        ['cola', 2],
      ],
    },
    {
      key: 'o2',
      placedBy: 'STAFF',
      placedMinutesAgo: 1520,
      transitionsMinutesAgo: [1516, 1500, 1495],
      items: [
        ['margherita', 1],
        ['spicy-beef-pizza', 1],
        ['water', 2],
      ],
      note: 'Phone order for pickup',
    },
    {
      key: 'o3',
      placedBy: 'GUEST',
      placedMinutesAgo: 250,
      transitionsMinutesAgo: [246, 232, 228],
      items: [
        ['shawarma-plate', 1],
        ['kofta-rice', 1],
        ['lemonade', 1],
        ['garden-salad', 1],
      ],
    },
    {
      key: 'o4',
      placedBy: 'GUEST',
      placedMinutesAgo: 130,
      transitionsMinutesAgo: [127, 112, 106],
      items: [
        ['margherita', 2],
        ['double-cheese', 1],
        ['cola', 3],
      ],
    },
    {
      key: 'o5',
      placedBy: 'GUEST',
      placedMinutesAgo: 25,
      transitionsMinutesAgo: [21, 8],
      items: [
        ['chicken-burger', 1],
        ['fries', 1],
        ['water', 1],
      ],
    },
    {
      key: 'o6',
      placedBy: 'GUEST',
      placedMinutesAgo: 12,
      transitionsMinutesAgo: [9],
      items: [
        ['spicy-beef-pizza', 1],
        ['garden-salad', 1],
        ['cola', 2],
      ],
    },
    {
      key: 'o7',
      placedBy: 'GUEST',
      placedMinutesAgo: 9,
      transitionsMinutesAgo: [6],
      items: [
        ['shawarma-plate', 2],
        ['lemonade', 2],
      ],
      note: 'Extra toum on the side',
    },
    {
      key: 'o8',
      placedBy: 'GUEST',
      placedMinutesAgo: 4,
      transitionsMinutesAgo: [],
      items: [
        ['classic-burger', 1],
        ['fries', 1],
        ['cola', 1],
      ],
    },
    {
      key: 'o9',
      placedBy: 'GUEST',
      placedMinutesAgo: 2,
      transitionsMinutesAgo: [],
      items: [
        ['margherita', 1],
        ['water', 1],
      ],
    },
    {
      key: 'o10',
      placedBy: 'GUEST',
      placedMinutesAgo: 50,
      transitionsMinutesAgo: [],
      canceledMinutesAgo: 45,
      items: [
        ['double-cheese', 1],
        ['cola', 1],
      ],
    },
  ],
};

/** A second, non-demo tenant with no business data, so B503 can test cross-tenant isolation. */
export const SECOND_TENANT: TenantSeedDefinition = {
  slug: 'harbor-grill',
  name: 'Harbor Grill',
  timezone: 'Africa/Cairo',
  isDemo: false,
  branch: { key: 'corniche', name: 'Corniche' },
  users: [
    { key: 'admin', name: 'Nadia Samir', email: 'nadia@harbor-grill.example', role: 'ADMIN' },
    {
      key: 'manager',
      name: 'Youssef Kamal',
      email: 'youssef@harbor-grill.example',
      role: 'MANAGER',
    },
    { key: 'worker', name: 'Hana Mostafa', email: 'hana@harbor-grill.example', role: 'WORKER' },
  ],
  categories: [],
  inventory: [],
  menu: [],
  events: [],
  orders: [],
};

export const SEED_TENANTS: TenantSeedDefinition[] = [DEMO_TENANT, SECOND_TENANT];
