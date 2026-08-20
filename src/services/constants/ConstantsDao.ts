import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { AppConstant } from "./types";

export class ConstantsDao extends SupabaseDAO<AppConstant> {
    private static instance: ConstantsDao;

    static getInstance() {
        if (!ConstantsDao.instance) {
            ConstantsDao.instance = new ConstantsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                "constants",
            );
        }
        return ConstantsDao.instance;
    }

    async getByType(type: string): Promise<AppConstant[]> {
        const { data, error } = await this.client
            .from(this.tableName)
            .select(this.select)
            .eq("type", type)
            .order("label");

        if (error) {
            throw error;
        }

        return (data ?? []).map((row) => this.mapJson(row));
    }
}
