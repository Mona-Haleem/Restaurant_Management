import { MenuItem } from "../models";

const names = [
    'Caesar Salad',
    'Molten Chocolate Lava Cake',
    'Grilled Steak',
    'Burger Deluxe',
    'Cheese Salad',
    'cheese cake',
    'Pasta Alfredo',
    'Chicken Wrap',
];

export const DUMMY_CATEGORIES = ['Healthy', 'Desserts', 'Italian', 'Fast Food'];

export const DUMMY_ITEMS: MenuItem[] = Array.from({ length: 12 }, (_, i) => ({
    _id: (i + 1).toString(),
    name: names[i % names.length],
    description: 'Delicious freshly prepared meal with high-quality ingredients.',
    price: 20 + (i % 5) * 10,
    category: DUMMY_CATEGORIES[i % DUMMY_CATEGORIES.length],
    isAvailable: i % 4 !== 0, // predictable availability
    imageUrl: `/test_recipe_${(i % names.length)}.png`,
    ingredients: [],
}));