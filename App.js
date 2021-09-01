import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, Button, Alert, Modal, TouchableHighlight } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
// import { shcToJws, shcChunksToJws, validate } from './qr';
// import validate from './jws-compact';
import axios from 'axios';
// import { validate } from 'health-cards-validation-sdk/js/src/api.js'

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [redOrGreen, setredOrGreen] = useState(true)

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
    // axios.post("http://045e-4-79-23-114.ngrok.io", { data: shc }, response)
    //   .then(res => console.log(res.json(data)))
    //   .catch(error => console.log(error));;

    axios.post("http://4aea-4-79-23-114.ngrok.io", {
      data: shc
    })
      .then(function (response) {
        console.log(response.data);
        response.data.data == true ? setredOrGreen(true) : setredOrGreen(false)
        setModalVisible(true);
      })
      .catch(function (error) {
        console.log(error);
      });

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
      <View style={styles.centeredView}>
        <Modal
          style={redOrGreen == true ? { backgroundColor: "#A5D6A7" } : { backgroundColor: "#FF8A65" }}
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => {
            Alert.alert('Modal has been closed.');
          }}>
          <View style={styles.centeredView}>
            <View style={styles.modalView}>
              <Text style={styles.modalText}>Hello World!</Text>

              <TouchableHighlight
                style={{ ...styles.openButton, backgroundColor: '#2196F3' }}
                onPress={() => {
                  setModalVisible(!modalVisible);
                }}>
                {redOrGreen == true ? <Text style={styles.textStyle}>Valid</Text> : <Text style={styles.textStyle}>Invalid</Text>}
              </TouchableHighlight>
            </View>
          </View>
        </Modal>
      </View>
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  openButton: {
    backgroundColor: '#F194FF',
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
  }
});