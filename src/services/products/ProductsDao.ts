/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { Entity } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

export type Product = Entity & {
    name: string;
    description: string;
    category: string;
}

export type ProductInventory = Entity & {
    product_id: string;
    variation: string;
    sku: string;
    unlimited: boolean;
    stock_count: number;
    price: number;
    on_sale: boolean;
    sale_price: number;
}

export type ProductHistory = Entity & {
    product_inventory_id: string;
    price: number;
    timestamp: string;
    changed_by: string;
}

const DEFAULT_SELECT = '*';

export class ProductsDao extends SupabaseDAO<Product> {
    private static instance: ProductsDao;

    static getInstance() {
        if (!ProductsDao.instance) {
            ProductsDao.instance = new ProductsDao(SupabaseConfiguration.getInstance().getSupabaseClient(), 'products', { select: DEFAULT_SELECT });
        }
        return ProductsDao.instance;
    }

}
