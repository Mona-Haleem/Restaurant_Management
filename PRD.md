# Tablz — Restaurant Management System

**Product Requirements Document · v1.0**  
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

Designed as a **portfolio project** demonstrating production-level Angular architecture across three roles.

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
| Customer | Restaurant patron       | Browse & order food |
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

## 🔁 Order State Machine

| From | To | Trigger |
|------|----|--------|
| — | PENDING | Customer / Worker |
| PENDING | IN_PREPARATION | Worker |
| IN_PREPARATION | READY | Worker |
| READY | DELIVERED | Worker |
| PENDING / IN_PREP | CANCELED | Worker / Manager |

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

- Menu browsing (search + filter)
- Cart with quantity control
- Multi-step checkout (Reactive Forms)
- Order tracking (polling every 10s)
- Cancel order (PENDING only)

---

### 👨‍🔧 Worker Module

- Live orders board (Kanban)
- Update order status
- Cancel with reason
- Waste logging (updates inventory)
- View personal waste logs

---

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

## 📅 Build Plan

| Week | Focus |
|------|------|
| Week 1 | Setup, auth, routing |
| Week 2 | Customer + Worker features |
| Week 3 | Inventory + Manager |
| Week 4 | Reports + polish |

---

## 🧰 Tech Stack

- **Angular 17+**
- **Angular Material**
- **RxJS**
- **Angular Signals**
- **JSON Server / Firebase**
- **ngx-charts**
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

✅ Ready to build (v1 scope)  
⏳ Timeline: 3–4 weeks (solo project)

---

## 📌 Author

Portfolio project for Angular demonstration.

---