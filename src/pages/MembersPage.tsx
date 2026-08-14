/**
 * MembersPage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
*/
import { useCallback, useContext, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumbs, Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import {
  DataGrid,
  GridFilterModel,
  GridRowParams,
  GridSortModel,
  useGridApiRef
} from '@mui/x-data-grid';


import { FilterItem, LoadingContext, PageInfo, QueryModel, RefreshContext, useNotifications } from "@digitalaidseattle/core";
import { DEFAULT_TABLE_PAGE_SIZE } from "../constants/Data";
import { Labels } from "../constants/Labels";
import { Profile } from "../services/members/ProfilesDao";
import { ProfilesService } from "../services/members/ProfilesService";

// ==============================|| DUMMY DATA ||==============================



// ==============================|| SAMPLE PAGE ||============================== //

export const MembersPage = () => {
  const profilesService = ProfilesService.getInstance();
  const notifications = useNotifications();

  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'email', sort: 'asc' }]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  const [pageInfo, setPageInfo] = useState<PageInfo<Profile>>({ rows: [], totalRowCount: 0 });
  const apiRef = useGridApiRef();
  const { setLoading } = useContext(LoadingContext);
  const { refresh } = useContext(RefreshContext);
  const navigate = useNavigate();

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

  // API data fetch, uncomment to replace dummy data with real data
  const fetchData = useCallback(() => {
    profilesService
      .find(createQueryModel())
      .then(data => setPageInfo(data))
      .catch(err => {
        notifications.error('Error fetching profiles.');
        console.error('Error fetching profiles:', err);
      })
      .finally(() => setLoading(false));

  }, [paginationModel, profilesService, setLoading, sortModel]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refresh])


  function createQueryModel(): QueryModel {
    const filterItems: FilterItem[] = [];
    if (filterModel && filterModel.items.length > 0) {
      const filterItem = filterModel.items[0];
      filterItems.push({
        field: filterItem.field,
        operator: filterItem.operator,
        value: filterItem.value
      })
    }
    const sortField = sortModel && sortModel.length > 0 ? sortModel![0].field : '';
    const sortDirection = sortModel && sortModel.length > 0 ? sortModel![0].sort : '';
    return {
      ...paginationModel,
      sortField: sortField,
      sortDirection: sortDirection,
      filterModel: {
        items: filterItems
      }
    } as QueryModel;
  }

  function handleRowClick(params: GridRowParams<Profile>): void {
    navigate(`/members/${params.row.id}`)
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

              pageSizeOptions={[5, 10, 25, 100]}
              paginationMode='server'
              paginationModel={paginationModel}
              rowCount={pageInfo.totalRowCount}
              onPaginationModelChange={setPaginationModel}

              sortingMode='server'
              sortModel={sortModel}
              onSortModelChange={setSortModel}

              filterMode="server"
              filterModel={filterModel}
              onFilterModelChange={setFilterModel}

              onRowClick={handleRowClick}
            />
          </CardContent>
        </Card>
      </Stack>
    </>)
};
