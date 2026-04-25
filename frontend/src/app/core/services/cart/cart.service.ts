import { Injectable } from "@angular/core";
import { CartItem, MenuItem } from "../../models";
import { BehaviorSubject, map } from "rxjs";

@Injectable({
    providedIn: 'root'
})
export class CartService {
    private cartSubject = new BehaviorSubject<CartItem[]>([]);
    cartItems$ = this.cartSubject.asObservable();


    get count() {
        return this.cartItems$.pipe(
            map(items => items.reduce((sum, item) => sum + item.quantity, 0))
        )

    }

    get total() {
        return this.cartItems$.pipe(
            map(items => items.reduce((total, cartItem) => total + cartItem.price * cartItem.quantity, 0))
        )
    }

    addToCart(item: MenuItem) {

        const existingItem = this.cartSubject.value.find(cartItem => cartItem._id === item._id);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            this.cartSubject.next([...this.cartSubject.value, { ...item, quantity: 1 }]);
        }
    }

    removeFromCart(id: string) {
        const existingItem = this.cartSubject.value.find(cartItem => cartItem._id === id);
        if (existingItem) {
            existingItem.quantity--;
            if (existingItem.quantity === 0) {
                this.cartSubject.next(this.cartSubject.value.filter(cartItem => cartItem._id !== id));
            }
        }
    }

    clearCart() {
        this.cartSubject.next([]);
    }

    getCart() {
        return this.cartSubject.value;
    }


}