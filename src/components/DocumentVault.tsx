import React from 'react';
import { DocumentVaultScreen } from './DocumentVaultScreen';

export interface DocumentVaultProps {
  onNavigateToCanvas?: (focusDateConflict?: boolean) => void;
  onNavigateHome?: () => void;
}

/**
 * <DocumentVault />
 * Component with simulated live API connections for Flights (Aviationstack)
 * and Trains (Navitime), featuring an AI emergency reschedule flow.
 */
export const DocumentVault: React.FC<DocumentVaultProps> = ({
  onNavigateToCanvas = () => {},
  onNavigateHome = () => {},
}) => {
  return (
    <DocumentVaultScreen
      onNavigateToCanvas={onNavigateToCanvas}
      onNavigateHome={onNavigateHome}
    />
  );
};

export default DocumentVault;
