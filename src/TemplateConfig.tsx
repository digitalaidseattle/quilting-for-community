

import {
    DashboardOutlined,
    DollarOutlined,
    ProductOutlined,
    RocketOutlined,
    ScheduleOutlined,
    TeamOutlined
} from '@ant-design/icons';
import logo from "./assets/images/q4c-logo-square.jpg";

import { MenuItem } from "@digitalaidseattle/mui";
import Notification from "./Notification";

export const TemplateConfig = () => {
    const dashboard = {
        id: 'group-dashboard',
        title: 'Navigation',
        type: 'group',
        children: [
            {
                id: 'dashboard',
                title: 'Dashboard',
                type: 'item',
                url: '/',
                icon: <DashboardOutlined />
            }
        ]
    } as MenuItem;

    const pages = {
        id: 'example',
        title: 'Examples',
        type: 'group',
        children: [
            {
                id: 'members',
                title: 'Members',
                type: 'item',
                url: '/members',
                icon: <TeamOutlined />
            } as MenuItem,
            {
                id: 'classes',
                title: 'Classes',
                type: 'item',
                url: '/classes',
                icon: <ScheduleOutlined />
            } as MenuItem,
            {
                id: 'events',
                title: 'Events',
                type: 'item',
                url: '/events',
                icon: <RocketOutlined />
            } as MenuItem,
            {
                id: 'products',
                title: 'Products',
                type: 'item',
                url: '/products',
                icon: <ProductOutlined />
            } as MenuItem,
            {
                id: 'transactions',
                title: 'Transactions',
                type: 'item',
                url: '/transactions',
                icon: <DollarOutlined />
            } as MenuItem
        ]
    } as MenuItem;

    return ({
        appName: import.meta.env.VITE_APPLICATION_NAME,
        logoUrl: logo,
        drawerWidth: 240,
        menuItems: [dashboard, pages],
        toolbarItems: [
            <Notification key={1} />
        ],
        version: '1.0.0'
    });
}