drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create trigger on_auth_user_updated
after update of email, raw_user_meta_data, raw_app_meta_data, last_sign_in_at on auth.users
for each row
when (
  old.email is distinct from new.email
  or old.raw_user_meta_data is distinct from new.raw_user_meta_data
  or old.raw_app_meta_data is distinct from new.raw_app_meta_data
  or old.last_sign_in_at is distinct from new.last_sign_in_at
)
execute function public.handle_new_user();
