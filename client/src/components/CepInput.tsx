import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { formatCEP } from '@/lib/validators';
import { Loader2 } from 'lucide-react';

export interface AddressData {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface CepInputProps {
  value: string;
  onChange: (cep: string) => void;
  onAddressFound?: (address: AddressData) => void;
  onError?: (error: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'data-testid'?: string;
}

export function CepInput({
  value,
  onChange,
  onAddressFound,
  onError,
  placeholder = "00000-000",
  className,
  disabled,
  id,
  'data-testid': dataTestId,
}: CepInputProps) {
  const [isLoading, setIsLoading] = useState(false);

  const fetchAddress = useCallback(async (cep: string) => {
    const numbers = cep.replace(/\D/g, '');
    if (numbers.length !== 8) return;

    setIsLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${numbers}/json/`);
      const data: AddressData = await response.json();
      
      if (data.erro) {
        onError?.('CEP não encontrado');
      } else {
        onAddressFound?.(data);
      }
    } catch (error) {
      onError?.('Erro ao buscar CEP');
    } finally {
      setIsLoading(false);
    }
  }, [onAddressFound, onError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCEP(e.target.value);
    onChange(formatted);
    
    const numbers = formatted.replace(/\D/g, '');
    if (numbers.length === 8) {
      fetchAddress(formatted);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        data-testid={dataTestId}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={9}
        className={className}
        disabled={disabled || isLoading}
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
