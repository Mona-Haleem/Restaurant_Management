import { MenuItem } from "../models";

const names = [
    'Burger Deluxe',
    'Chicken Wrap',
    'Pasta Alfredo',
    'Veggie Pizza',
    'Grilled Steak',
    'Caesar Salad',
];

export const DUMMY_CATEGORIES = ['Fast Food', 'Italian', 'Healthy'];

export const DUMMY_ITEMS: MenuItem[] = Array.from({ length: 12 }, (_, i) => ({
    _id: (i + 1).toString(),
    name: names[i % names.length],
    description: 'Delicious freshly prepared meal with high-quality ingredients.',
    price: 20 + (i % 5) * 10,
    category: ['Fast Food', 'Italian', 'Healthy'][i % 3],
    isAvailable: i % 4 !== 0, // predictable availability
    imageUrl: `/test_recipe_${(i % 3) + 1}.png`,
    ingredients: [],
}));