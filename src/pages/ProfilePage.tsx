/**
 * ProfilePage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
 */
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";

import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography
} from "@mui/material";

import { Labels } from "../constants/Labels";
import { Profile } from "../services/members/ProfilesDao";
import { MockProfilesService } from "../services/members/MockProfilesService";

export const ProfilePage = () => {
  const service = MockProfilesService.getInstance();
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile>();

  useEffect(() => {
    if (id) {
      service.getById(id)
        .then(found => setProfile(found));
    }
  }, [service, id]);

  return (
    <>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <NavLink aria-label={Labels.HOME} role="button" title={Labels.HOME} to="/">
          <Typography color="text.secondary">Home</Typography>
        </NavLink>
        <NavLink to="/members">
          <Typography color="text.secondary">{Labels.MEMBERS}</Typography>
        </NavLink>
        <Typography color="text.primary">{profile ? profile.name : "Profile"}</Typography>
      </Breadcrumbs>

      <Stack spacing={2}>
        <Card>
          <CardContent>
            {profile ? (
              <Stack spacing={2}>
                <Typography variant="h4" component="h1">
                  {profile.name}
                </Typography>
                <Divider />
                <Typography variant="body1">
                  <strong>ID:</strong> {profile.id}
                </Typography>
                <Typography variant="body1">
                  <strong>Email:</strong> {profile.email}
                </Typography>
                <Typography variant="body1">
                  <strong>Phone Number:</strong> {profile.phone}
                </Typography>
                <Typography variant="body1">
                  <strong>Roles:</strong> {profile.roles.join(", ")}
                </Typography>
                <Typography variant="body1">
                  <strong>Waiver Accepted:</strong> {profile.waiver_accepted ? "Yes" : "No"}
                </Typography>
                {/* <Typography variant="body1">
                  <strong>Joined:</strong> {profile.joinedDate}
                </Typography> */}
              </Stack>
            ) : (
              <Typography variant="h6" color="error">
                Profile with ID "{id}" not found.
              </Typography>
            )}

            <Button
              variant="outlined"
              startIcon={<ArrowLeftOutlined />}
              component={NavLink}
              to="/members"
              sx={{ mt: 3 }}
            >
              Back to Members
            </Button>
          </CardContent>
        </Card>
      </Stack>
    </>
  );
};