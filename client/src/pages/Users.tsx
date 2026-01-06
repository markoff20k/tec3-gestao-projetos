import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { api, User } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const roleLabels: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  coordinator: 'Coordenador',
  commercial: 'Comercial',
  user: 'Usuário',
};

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  coordinator: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  commercial: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  user: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function Users() {
  const { hasRole } = useAuth();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/auth/users'],
    enabled: hasRole(['owner']),
  });

  if (!hasRole(['owner'])) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Acesso não autorizado</div>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Carregando...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Usuários</h1>
          <p className="text-muted-foreground">Gerenciamento de usuários do sistema</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            {!users || users.length === 0 ? (
              <p className="text-muted-foreground">Nenhum usuário cadastrado</p>
            ) : (
              <div className="space-y-4">
                {users.map((user) => (
                  <div
                    key={user.id}
                    data-testid={`row-user-${user.id}`}
                    className="flex items-center justify-between p-4 border rounded-md"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarFallback>
                          {user.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <Badge className={roleColors[user.role] || ''}>
                      {roleLabels[user.role] || user.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
