import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, Button } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
// import { shcToJws, shcChunksToJws, validate } from './qr';
// import validate from './jws-compact';
import axios from 'axios';
// import { validate } from 'health-cards-validation-sdk/js/src/api.js'

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ type, data }) => {
    setScanned(true);
    // alert(`QR Code has been scanned.  Type: ${type} || Data: ${data}`);
    console.log(`Type: ${type} || Data: ${data}`)
    var shc = [`${data}`]
    // const jwsString = 'eyJ6aXAiOiJ...';
    // const results = validate.shc(data);
    // results.then(console.log)
    axios.post("http://72af-4-79-23-114.ngrok.io", { data: shc })
      .then(res => res.json())
      .then(res => {
        // console.log(res)
      }).catch(error => console.log(error));;

    // var decode = shcChunksToJws(shc)
    // var decode = validate(shc)
    // alert('QR Code has been decoded.')
    // console.log(decode)
    // console.log("Payload Validation")
    // var payload = validate(decode.result)
    // console.log(payload)
  };

  if (hasPermission === null) {
    return <Text>Requesting for camera permission</Text>;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      {scanned && <Button title={'Tap to Scan Again'} onPress={() => setScanned(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});