import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, Alert, Modal, TouchableHighlight, Dimensions } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import axios from 'axios';

// let scanx = Dimensions.get('window').width * 0.75;
// let scany = Dimensions.get('window').height * 0.75;

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


  const handleBarCodeScanned = ({ type, data, bounds }) => {
    // console.log(bounds.origin)
    // scanx = bounds.origin.x
    // scany = bounds.origin.y
    setScanned(true);
    console.log(`Type: ${type} || Data: ${data}`)
    var shc = [`${data}`]
    axios.post("http://3913-4-79-23-114.ngrok.io", {
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
        style={StyleSheet.absoluteFillObject} />
      <View style={styles.centeredView}>
        <Modal
          style={redOrGreen == true ? { backgroundColor: "#A5D6A7" } : { backgroundColor: "#FF8A65" }}
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => { Alert.alert('Modal has been closed.') }}>
          <View style={styles.centeredView}>
            <View style={styles.modalView}>
              {redOrGreen == true ?
                <Text style={{ color: "#A5D6A7", marginBottom: Dimensions.get('window').height * 0.06, paddingBottom: Dimensions.get('window').width * 0.2, textAlign: 'center', fontSize: Dimensions.get('window').height * 0.06 }}>
                  QR Code has been validated.</Text> :
                <Text style={{ color: "#FF8A65", marginBottom: Dimensions.get('window').height * 0.06, paddingBottom: Dimensions.get('window').width * 0.2, textAlign: 'center', fontSize: Dimensions.get('window').height * 0.06 }}>
                  QR Code is invalid.</Text>}
              <TouchableHighlight
                style={{ ...styles.openButton, backgroundColor: '#2196F3' }}
                onPress={() => { setModalVisible(!modalVisible); setScanned(false) }}>
                <Text style={styles.textStyle}>Tap to Scan Again</Text>
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
    height: Dimensions.get('window').height * 0.75,
    width: Dimensions.get('window').width * 0.75,
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
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 10,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: Dimensions.get('window').height * 0.03,
    padding: Dimensions.get('window').height * 0.05
  },
  modalText: {
    marginBottom: 15,
    paddingBottom: Dimensions.get('window').width * 0.2,
    textAlign: 'center',
    fontSize: Dimensions.get('window').height * 0.06
  }
});