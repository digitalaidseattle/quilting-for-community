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

    static getInstance() {
        if (!ProductsDao.instance) {
            ProductsDao.instance = new ProductsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'products',
                { select: '*' }
            );
        }
        return ProductsDao.instance;
    }

}
