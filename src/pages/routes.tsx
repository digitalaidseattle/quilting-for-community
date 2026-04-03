import {
  Error,
  Login,
  MainLayout,
  MarkdownPage,
  MinimalLayout
} from "@digitalaidseattle/mui";


import SamplePage from './SamplePage';
import { MembersPage } from "./MembersPage";
import { ClassesPage } from "./ClassesPage";
import { EventsPage } from "./EventsPage";
import { TransactionsPage } from "./TransactionsPage";
import { ProductsPage } from "./ProductsPage";
import { AuthGate } from "@digitalaidseattle/core";

const routes = [
  {
    path: "/",
    element: (
      <AuthGate authorizedRoles={["admin"]}>
        <MainLayout />
      </AuthGate>
    ),
    children: [
      {
        path: "",
        element: <SamplePage />
      },
      {
        path: "/members",
        element: <MembersPage />,
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
        element: <Login />
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
