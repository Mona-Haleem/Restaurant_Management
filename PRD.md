# Tablz — Restaurant Management System

**Product Requirements Document · v1.1**  
Angular Portfolio Project

---

## 📌 Overview

**Tablz** is a multi-role restaurant management web application built with Angular.  
It covers the full operational loop:
- Customer ordering
- Kitchen workflow
- Inventory deduction
- Waste logging
- End-of-day reporting
- **Customer**: Browsing menu, managing cart, and tracking orders.
- **Worker**: Real-time order management and waste logging.
- **Manager**: Inventory control, reporting, and staff management.

Designed as a **production-grade portfolio project** demonstrating robust Angular architecture.

---

## 🚨 Problem Statement

Small and mid-size restaurants often rely on:

- Paper tickets
- WhatsApp communication
- Manual stock tracking

This leads to:

- Inaccurate inventory
- Untracked waste
- No visibility into revenue

**Tablz digitizes this entire workflow.**



---

## 🎯 Goals

- Demonstrate Angular architecture (routing, RxJS, reactive forms)
- Build a complete v1 in **3–4 weeks**
- Create a strong **interview-ready portfolio project**
- Provide a base for real-time v2 features
- Maintain high coverage with Vitest/Angular Testing Library.
---

## ❌ Out of Scope (v1)

- Payment integration
- Real-time kitchen display
- Multi-branch support
- Mobile apps
- Notifications (SMS/email)
---
## 👥 User Roles

| Role     | Description              | Goal |
|----------|------------------------|------|
| Customer | Restaurant patron       | Browse & order food or cancel order|
| Worker   | Waiter / staff          | Manage orders & waste |
| Manager  | Owner / operator        | Inventory & reports |

---

## 🔄 Core Workflow

1. Customer places order
2. Order status progression:
   - `PENDING → IN_PREPARATION → READY → DELIVERED`
3. On **DELIVERED**:
   - Inventory is deducted
4. On **CANCELED**:
   - No inventory change
5. Workers log waste anytime
6. Manager performs **end-of-day reconciliation**

---

## 👥 User Roles & Core Workflows

### 1. Customer (Patron)
- **Workflow**: Browse Menu → Filter/Search → Add to Cart → Place Order → Track Status.
- **Key Pain Point**: Knowing exactly when food is ready.

### 2. Worker (Staff/Kitchen)
- **Workflow**: View Pending Orders → Start Preparation → Mark Ready → Confirm Delivery.
- **Key Pain Point**: Communicating order status and tracking inventory waste.

### 3. Manager (Owner)
- **Workflow**: Manage Menu → Monitor Inventory → View Revenue Reports.
- **Key Pain Point**: Lack of visibility into stock levels and daily profit.

---

## ⚙️ Features

### 🔐 Authentication

- JWT-based login
- Role-based route guards
- Lazy-loaded modules
- HTTP interceptor
- Auto logout on expiry

---

### 🧑‍🍳 Customer Module
- **Menu Experience**:
  - Search by item name.
  - Filter by categories (Main, Starters, Drinks, etc.).
  - Responsive Grid layout.
- **Cart Management**:
  - Add/Remove items.
  - Adjust quantities.
  - Total price calculation in real-time.
- **Order Tracking**:
  - Real-time status updates (Polling/RxJS).
  - Order history (Simple view).
  - Cancel order (PENDING only)


### 👨‍🔧 Worker Module
- **Orders Board**:
  - Kanban-style board for `PENDING`, `IN_PREPARATION`, and `READY` orders.
- **Inventory Actions**:
  - Mark order as `DELIVERED` (triggers auto-inventory deduction).
  - Log item waste (manual stock correction).

### 🧑‍💼 Manager Module

#### Menu Management
- CRUD (create, edit, archive)
- Ingredients per item

#### Inventory
- Stock tracking
- Restock form
- Low-stock alerts

#### Reconciliation
- Compare expected vs physical stock
- Detect unexplained waste

#### Reports
- Revenue
- Orders
- Waste cost

#### Staff
- Create / deactivate workers

---

## 🏗️ Angular Architecture
### Modules

- `CoreModule` → services, guards, interceptor
- `SharedModule` → reusable UI components
- `AuthModule`
- `CustomerModule`
- `WorkerModule`
- `ManagerModule`

---

### Services

| Service | Responsibility |
|--------|---------------|
| AuthService | Auth & token |
| OrderService | Orders & polling |
| MenuService | Menu CRUD |
| InventoryService | Stock & waste |
| ReportService | Data aggregation |
| CartService | Local cart (signals) |

---

### Key Angular Concepts

- Lazy loading
- Route guards
- HTTP interceptors
- Reactive forms
- RxJS (debounce, switchMap, interval)
- Angular Signals
- OnPush change detection

---

## 📦 Data Models

### Core Interfaces

- **User**
- **MenuItem**
- **Order**
- **InventoryItem**
- **WasteEntry**
- **ReconciliationEntry**

---

## 🖥️ Screens

### Customer
- Menu
- Cart
- Checkout
- Order Tracking

### Worker
- Orders Board
- Order Details
- Waste Form

### Manager
- Dashboard
- Menu Manager
- Inventory
- Reports
- Staff

---

## 🧰 Tech Stack (Updated)

- **Frontend**: Angular 17+ (Stand-alone components)
- **State**: RxJS (Observables), Signals
- **Styling**: SCSS (BEM naming convention)
- **Testing**: Vitest, Angular Testing Library
- **Icons**: Lucide Angular / FontAwesome
- **Angular Material**
- **ngx-charts**
- **Backend**: JSON Server / Firebase (Temporary) (next step :express , mogo ,mongoose)

## 🧰 Tech Stack

- **Angular 17+**
- **RxJS**
- **Angular Signals**
- **SCSS**

---

## 💬 Interview Talking Points

### Key Highlights

- Multi-role architecture with lazy loading
- Inventory auto-deduction logic
- RxJS for polling & filtering
- Reactive forms for complex workflows

---

### Sample 30-sec Pitch

> Tablz is a restaurant management system built with Angular that demonstrates multi-role architecture.  
> It includes customer ordering, worker order handling, and manager inventory/reporting.  
> The core logic revolves around inventory deduction on delivery, waste tracking, and reconciliation.  
> I used RxJS for polling, reactive forms for workflows, and Angular Signals for state management.

---

## 🚀 Future Improvements (v2)

- Real-time updates (Firebase)
- Kitchen display screen
- Push notifications
- Multi-branch support
---

## 📄 Status
✅ PRD Revised (v1.1)  
⏳ Current Focus: Completing Customer Module Tracking logic.

---
## 🚦 Project Status

| Module | Status | Progress |
|--------|--------|----------|
| **Core** | In Progress | Models defined, Base Services created |
| **Customer** | In Progress | Menu, Search, Category Filter, Cart Sidebar (Draft) |
| **Worker** | Not Started | Routes defined |
| **Manager** | Not Started | Planning phase |