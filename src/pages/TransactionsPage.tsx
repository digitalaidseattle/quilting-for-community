/**
 * TransactionsPage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
*/
import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumbs, Card, CardContent, IconButton, Typography } from '@mui/material';
import { NavLink } from "react-router-dom";
import { Labels } from "../constants/Labels";


// ==============================|| SAMPLE PAGE ||============================== //

export const TransactionsPage = () => (
  <>
    <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
      <NavLink aria-label={Labels.HOME} role="button" title={Labels.HOME} to="/" >
        <IconButton size="medium">
          <HomeOutlined />
        </IconButton>
      </NavLink>
      <Typography color="text.primary">{Labels.TRANSACTIONS}</Typography>
    </Breadcrumbs>
    <Card title={Labels.TRANSACTIONS}>
      <CardContent>Table goes here</CardContent>
    </Card>
  </>
);
