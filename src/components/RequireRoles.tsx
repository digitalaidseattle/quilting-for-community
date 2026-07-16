import { PropsWithChildren, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { User, useAuthService } from "@digitalaidseattle/core";

type AuthorizationStatus = "checking" | "authorized";

type RequireRolesProps = PropsWithChildren<{
  authorizedRoles: string[];
}>;

export const RequireRoles = ({ authorizedRoles, children }: RequireRolesProps) => {
  const authService = useAuthService();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AuthorizationStatus>("checking");

  useEffect(() => {
    let active = true;

    authService.getUser().then((user: User | null) => {
      if (!active) {
        return;
      }

      if (!user) {
        navigate("/login?code=Unauthenticated", { replace: true });
        return;
      }

      if (!authService.isAuthorized(user, authorizedRoles)) {
        navigate("/login?code=AccessDenied", { replace: true });
        return;
      }

      setStatus("authorized");
    });

    return () => {
      active = false;
    };
  }, [authService, authorizedRoles, navigate]);

  if (status === "checking") {
    return null;
  }

  return <>{children}</>;
};
