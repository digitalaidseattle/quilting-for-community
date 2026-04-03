/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { Entity } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

export type Class = Entity & {
    sku: string;
    name: string;
    description: string;
    length: number;  // e.g. 1, 0.5
}

const DEFAULT_SELECT = '*';

export class ClassesDao extends SupabaseDAO<Class> {
    private static instance: ClassesDao;

    static getInstance() {
        if (!ClassesDao.instance) {
            ClassesDao.instance = new ClassesDao(SupabaseConfiguration.getInstance().getSupabaseClient(), 'classes', { select: DEFAULT_SELECT });
        }
        return ClassesDao.instance;
    }

}
