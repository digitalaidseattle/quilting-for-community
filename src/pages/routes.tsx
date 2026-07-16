import {
  Error,
  MainLayout,
  MarkdownPage,
  MinimalLayout
} from "@digitalaidseattle/mui";

import SamplePage from './SamplePage';
import LoginPage from './LoginPage';
import { MembersPage } from "./MembersPage";
import { TransactionsPage } from "./TransactionsPage";
import { ProductsPage } from "./ProductsPage";
import { AdminEventManagementPage } from "./admin/AdminEventManagementPage";
import { EventsPage } from "./EventsPage";
import { ClassesPage } from "./ClassesPage";
import { RequireRoles } from "../components/RequireRoles";

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
          <RequireRoles authorizedRoles={["admin"]}>
            <MembersPage />
          </RequireRoles>
        ),
      },
      {
        path: "/classes",
        element: <ClassesPage />,
      },
      {
        path: "/events",
        element: <EventsPage />,
      },
      {
        path: "/admin/event-management",
        element: (
          <RequireRoles authorizedRoles={["admin"]}>
            <AdminEventManagementPage />
          </RequireRoles>
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
