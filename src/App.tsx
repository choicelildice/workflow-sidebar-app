import React, { useMemo } from 'react';
import { locations } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import { SDKProvider } from '@contentful/react-apps-toolkit';
import { GlobalStyles } from '@contentful/f36-components';
import Sidebar from './locations/Sidebar';
import ConfigScreen from './locations/ConfigScreen';

const ComponentLocationSettings = {
  [locations.LOCATION_ENTRY_SIDEBAR]: Sidebar,
  [locations.LOCATION_APP_CONFIG]: ConfigScreen,
};

const App = () => {
  const sdk = useSDK();

  const Component = useMemo(() => {
    for (const [location, component] of Object.entries(ComponentLocationSettings)) {
      if (sdk.location.is(location)) {
        return component;
      }
    }
    return null;
  }, [sdk.location]);

  return Component ? <Component /> : null;
};

const AppWrapper = () => (
  <SDKProvider>
    <GlobalStyles />
    <App />
  </SDKProvider>
);

export default AppWrapper;
