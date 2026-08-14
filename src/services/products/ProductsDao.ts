/**
 *  ProductsDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { Product } from "./types";

export class ProductsDao extends SupabaseDAO<Product> {
    private static instance: ProductsDao;

    static empty(): Product {
        return {
            category: '',
            name: '',
            description: '',
            sku: '',
            options: {},
            images: [] as string[],
            status: '',
        } as Product;
    }

    static getInstance() {
        if (!ProductsDao.instance) {
            ProductsDao.instance = new ProductsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'products',
                { select: '*, product_history(*)' }
            );
        }
        return ProductsDao.instance;
    }

}
