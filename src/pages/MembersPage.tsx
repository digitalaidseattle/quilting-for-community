/**
 * MembersPage.tsx
 * 
 * @copyright 2026 Digital Aid Seattle
*/
import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { ExportOutlined, FilterOutlined, HomeOutlined, PlusOutlined, TableOutlined } from "@ant-design/icons";
import { Box, Breadcrumbs, Card, CardContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import {
  ColumnsPanelTrigger,
  DataGrid,
  ExportCsv,
  FilterPanelTrigger,
  GridFilterModel,
  GridRowParams,
  GridSortModel,
  Toolbar,
  ToolbarPropsOverrides,
  useGridApiRef
} from '@mui/x-data-grid';


import { FilterItem, LoadingContext, PageInfo, QueryModel, RefreshContext, useNotifications } from "@digitalaidseattle/core";
import ProfileDialog from "../components/ProfileDialog";
import { QuickSearch } from "../components/QuickSearch";
import { DEFAULT_TABLE_PAGE_SIZE } from "../constants/Data";
import { Labels } from "../constants/Labels";
import { Profile } from "../services/members/ProfilesDao";
import { ProfilesService } from "../services/members/ProfilesService";


// function createQueryModel(
//   paginationModel: { page: number, pageSize: number },
//   sortModel: GridSortModel,
//   filterModel: GridFilterModel,
// ): QueryModel {
//   const filterItems: FilterItem[] = [];
//   if (filterModel && filterModel.items.length > 0) {
//     const filterItem = filterModel.items[0];
//     filterItems.push({
//       field: filterItem.field,
//       operator: filterItem.operator,
//       value: filterItem.value
//     })
//   }
//   const sortField = sortModel && sortModel.length > 0 ? sortModel![0].field : '';
//   const sortDirection = sortModel && sortModel.length > 0 ? sortModel![0].sort : '';
//   return {
//     ...paginationModel,
//     sortField: sortField,
//     sortDirection: sortDirection,
//     filterModel: {
//       items: filterItems
//     }
//   } as QueryModel;
// }

// ==============================|| SAMPLE PAGE ||============================== //

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    tools?: ReactNode;
    onSearch?: (search: string) => void;
  }
}

function CustomToolbar({ tools, onSearch }: ToolbarPropsOverrides) {
  return (
    <Toolbar>
      {tools}

      <Box sx={{ flex: 1 }} />

      <ColumnsPanelTrigger render={<Tooltip title={"Manage columns"}><IconButton ><TableOutlined /></IconButton></Tooltip>} />
      <FilterPanelTrigger render={<Tooltip title={"Filter rows"}><IconButton ><FilterOutlined /></IconButton></Tooltip>} />
      <ExportCsv render={<Tooltip title={"Export"}><IconButton><ExportOutlined /></IconButton></Tooltip>} />
      {onSearch && <QuickSearch onChange={onSearch} />}
    </Toolbar>
  );
}

export const MembersPage = () => {
  const profilesService = ProfilesService.getInstance();
  const notifications = useNotifications();
  const navigate = useNavigate();

  const { setLoading } = useContext(LoadingContext);
  const { refresh, setRefresh } = useContext(RefreshContext);

  const apiRef = useGridApiRef();
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'email', sort: 'asc' }]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  const [pageInfo, setPageInfo] = useState<PageInfo<Profile>>({ rows: [], totalRowCount: 0 });

  const [profile, setProfile] = useState<Profile | undefined>();
  const [openProfileDialog, setOpenProfileDialog] = useState<boolean>(false);

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

  const notificationsRef = useRef(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  });

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

  useEffect(() => {
    let active = true;
    setLoading(true);
    profilesService.find(createQueryModel())
      .then(data => {
        if (active) {
          setPageInfo(data);
        }
      })
      .catch(err => {
        notificationsRef.current.error('Error fetching profiles.');
        console.error('Error fetching profiles:', err);
      })
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, [refresh, paginationModel, sortModel, filterModel]);


  function addProfile() {
    setProfile({ ...profilesService.empty() });
    setOpenProfileDialog(true);
  }

  function handleProfileChange(updated: Profile | null) {
    if (updated === null) {
      setProfile(undefined);
      setOpenProfileDialog(false);
    } else {
      const newProfile = {
        ...profile,
        ...updated
      }
      profilesService.insert(newProfile)
        .then(result => {
          setProfile(undefined);
          setOpenProfileDialog(false);
          notifications.success(`Member ${result.name} has been added.`);
          setRefresh(Date.now());
        })
        .catch(err => {
          console.error(`Problems adding ${newProfile.first_name} ${newProfile.last_name}.`, err);
          notifications.error(`Problems adding ${newProfile.first_name} ${newProfile.last_name}.`)
        })
    }
  }

  function addButton(): ReactNode {
    return <Tooltip title="Add Member">
      <IconButton color="primary" size="small" onClick={addProfile} aria-label="Add Member">
        <PlusOutlined />
      </IconButton>
    </Tooltip>
  }

  function handleRowClick(params: GridRowParams<Profile>): void {
    navigate(`/members/${params.row.id}`)
  }

  const handleSearch = (search: string): void => {
    console.log('FIXME: ' + search)
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
              showToolbar={true}
              slots={{ toolbar: CustomToolbar }}
              slotProps={{
                toolbar: {
                  tools: addButton(),
                  onSearch: handleSearch
                }
              }}
            />
          </CardContent>
        </Card>
        {profile &&
          <ProfileDialog
            title={Labels.ADD_PROFILE}
            profile={profile}
            open={openProfileDialog}
            onChange={handleProfileChange} />
        }
      </Stack>
    </>)
};
