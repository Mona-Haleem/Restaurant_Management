import { MenuItem, Order, OrderStatusList } from "../models";

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


export const DUMMY_ORDERS: Order[] =Array.from({ length: 5 }, (_, i) =>{ 
    const statusRandome = Math.random();
    const statusIndex = statusRandome < 0.05 ? 0 : statusRandome < 0.15 ? 1 : statusRandome < 0.25 ? 2 : statusRandome < 0.9 ? 3 : 4;
    const typeRandome = Math.random();
    const type = typeRandome < 0.33 ? 'delivery' : typeRandome < 0.66 ? 'pickup' : 'dine-in';
    const location = type === 'dine-in' ? i + 1 :type=='delivery'? '123 Main St' :'counter';
    const itemCount = Math.ceil(Math.random() * 4) ;
    const items = Array.from({ length: itemCount }, () => ({ ...DUMMY_ITEMS[Math.floor(Math.random() * DUMMY_ITEMS.length)], quantity: Math.floor(Math.random() * 5) + 1 }));
    const hoursAgo = Math.floor(Math.random() * 12); // Orders from the last 48 hours
    return{
        _id: `order-${i + 1}`,
        userId: 'user-1',
        type,
        location,
        items,
        status: OrderStatusList[statusIndex],
        totalPrice: items.reduce((total, item) => total + item.price * item.quantity, 0),
        createdBy: 'John Doe',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * hoursAgo).toISOString(), // 1 hour ago
        updatedAt: new Date(Date.now() - 1000 * 60 * 30 * Math.min(hoursAgo - 2,0)).toISOString(), // 30 mins ago
    }});