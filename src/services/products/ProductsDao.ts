/**
 *  ProductsDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { Entity } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

export type Product = Entity & {
    // Category stored in constants table
    category: string;
    name: string;
    description: string;
    // Stock Keeping Unit (unique ID for each product)
    sku: string;
    options: Record<string, unknown>;
    images: string[];
    // Status stored in constants table
    status: string;
}

export type ProductHistory = Entity & {
    product_id: string;
    change_date: string;
    sale_price: number | null;
    regular_price: number;
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
