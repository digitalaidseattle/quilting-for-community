import {
  Error,
  MainLayout,
  MarkdownPage,
  MinimalLayout
} from "@digitalaidseattle/mui";
import { AuthGate } from "@digitalaidseattle/core";

import SamplePage from './SamplePage';
import LoginPage from './LoginPage';
import { MembersPage } from "./MembersPage";
import { TransactionsPage } from "./TransactionsPage";
import { ProductsPage } from "./ProductsPage";
import { AdminEventManagementPage } from "./admin/AdminEventManagementPage";
import { AdminEventPage } from "./admin/AdminEventPage";
import { EventsPage } from "./EventsPage";
import { ProfilePage } from "./ProfilePage";

const routes = [
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        path: "",
        element: <SamplePage />
      },
      {
        path: "/members",
        element: (
          <AuthGate authorizedRoles={["admin"]}>
            <MembersPage />
          </AuthGate>
        ),
      },
      {
        path: "/members/:id",
        element: (
          <AuthGate authorizedRoles={["admin"]}>
            <ProfilePage />
          </AuthGate>
        ),
      },
      {
        path: "/events",
        element: <EventsPage />,
      },
      {
        path: "/admin/event-management",
        element: (
          <AuthGate authorizedRoles={["admin"]}>
            <AdminEventManagementPage />
          </AuthGate>
        ),
      },
      {
        path: "/admin/event-management/new",
        element: (
          <AuthGate authorizedRoles={["admin"]}>
            <AdminEventPage />
          </AuthGate>
        ),
      },
      {
        path: "/admin/event-management/:id",
        element: (
          <AuthGate authorizedRoles={["admin"]}>
            <AdminEventPage />
          </AuthGate>
        ),
      },
      {
        path: "/products",
        element: <ProductsPage />,
      },
      {
        path: "/transactions",
        element: <TransactionsPage />,
      },
      {
        path: "privacy",
        element: <MarkdownPage filepath='privacy.md' />,
      }
    ]
  },
  {
    path: "/",
    element: <MinimalLayout />,
    children: [
      {
        path: 'login',
        element: <LoginPage />
      }
    ]
  },
  {
    path: "*",
    element: <MinimalLayout />,
    children: [
      {
        path: '*',
        element: <Error />
      }
    ]
  }
];

export { routes };
