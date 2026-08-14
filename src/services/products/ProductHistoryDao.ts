import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { ProductHistory } from "./types";

export class ProductHistoryDao extends SupabaseDAO<ProductHistory> {
    private static instance: ProductHistoryDao;

    static getInstance() {
        if (!ProductHistoryDao.instance) {
            ProductHistoryDao.instance = new ProductHistoryDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'product_history'
            );
        }
        return ProductHistoryDao.instance;
    }

    async getByProductId(productId: string): Promise<ProductHistory[]> {
        const { data, error } = await this.client
            .from(this.tableName)
            .select(this.select)
            .eq('product_id', productId)
            .order('change_date', { ascending: false });

        if (error) {
            throw error;
        }

        return (data ?? []).map((row) => this.mapJson(row));
    }
}
