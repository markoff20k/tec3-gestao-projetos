import { useQuery } from '@tanstack/react-query';
import { accessGroupsApi } from '@/lib/api';

/**
 * Permissões efetivas do usuário logado, vindas dos grupos do diretório.
 *
 * Serve para a interface não oferecer o que o servidor vai recusar. Não é
 * controle de acesso: a decisão que vale é sempre a do servidor — aqui o
 * objetivo é só não mostrar um botão que daria erro ao ser clicado.
 */
export function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/auth/permissions'],
    queryFn: () => accessGroupsApi.getMyPermissions(),
    staleTime: 60_000,
  });

  const permissions = data?.permissions ?? [];
  const role = data?.role ?? null;

  return {
    isLoading,
    role,
    groups: data?.groups ?? [],
    permissions,
    /** Admin passa em tudo, como no servidor. */
    can: (permission: string) => role === 'admin' || permissions.includes(permission),
  };
}
