/**
 * MembersPage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
*/
import { useContext, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumbs, Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import {
  DataGrid,
  GridSortModel,
  useGridApiRef
} from '@mui/x-data-grid';


import { LoadingContext, PageInfo, QueryModel, RefreshContext } from "@digitalaidseattle/core";
import { DEFAULT_TABLE_PAGE_SIZE } from "../constants/Data";
import { Labels } from "../constants/Labels";
import { Profile, ProfilesDao } from "../services/members/ProfilesDao";


// ==============================|| SAMPLE PAGE ||============================== //

export const MembersPage = () => {
  const profilesDao = ProfilesDao.getInstance();

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'created_at', sort: 'desc' }]);
  const [pageInfo, setPageInfo] = useState<PageInfo<Profile>>({ rows: [], totalRowCount: 0 });
  const apiRef = useGridApiRef();
  const { setLoading } = useContext(LoadingContext);
  const { refresh } = useContext(RefreshContext);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [paginationModel, sortModel, refresh])

  const columns = [
    {
      field: 'name',
      headerName: Labels.NAME,
      width: 150,
    },
    {
      field: 'email',
      headerName: Labels.EMAIL,
      width: 250,
    }
  ];

  function fetchData() {
    if (paginationModel && sortModel) {
      const queryModel = {
        page: paginationModel.page,
        pageSize: paginationModel.pageSize,
        sortField: sortModel.length === 0 ? 'created_at' : sortModel[0].field,
        sortDirection: sortModel.length === 0 ? 'created_at' : sortModel[0].sort
      } as QueryModel;

      setLoading(true);
      profilesDao.find(queryModel)
        .then((sess) => setPageInfo(sess))
        .finally(() => setLoading(false))
    }

  }

  function handleRowClick(params: any, _event: any, _details: any): void {
    navigate(`/profile/${params.row.id}`)
  }

  return (
    <>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <NavLink aria-label={Labels.HOME} role="button" title={Labels.HOME} to="/" >
          <IconButton size="medium">
            <HomeOutlined />
          </IconButton>
        </NavLink>
        <Typography color="text.primary">{Labels.MEMBERS}</Typography>
      </Breadcrumbs>
      <Stack direction="column" spacing={1} >
        <Card>
          <CardContent>
            <Typography variant="h5" component="div" gutterBottom>
              Some kind of upload widget
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataGrid
              apiRef={apiRef}
              rows={pageInfo.rows}
              columns={columns}

              paginationMode='server'
              paginationModel={paginationModel}
              rowCount={pageInfo.totalRowCount}
              onPaginationModelChange={setPaginationModel}

              sortingMode='server'
              sortModel={sortModel}
              onSortModelChange={setSortModel}

              pageSizeOptions={[5, 10, 25, 100]}

              disableRowSelectionOnClick={false}
              onRowClick={handleRowClick}
            />
          </CardContent>
        </Card>
      </Stack>
    </>)
};
