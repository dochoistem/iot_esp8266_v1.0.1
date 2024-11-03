//% color=#ed7b00 icon="\uf1eb"
namespace DoChoiSTEM {
    	let wifi_connected: boolean = false
    	let thingspeak_connected: boolean = false
    	let thingspeak_upload:boolean = false
    	let internetTimeInitialized = false
	let internetTimeUpdated = false
	let year = 0, month = 0, day = 0, weekday = 0, hour = 0, minute = 0, second = 0
	const NTP_SERVER_URL = "pool.ntp.org"
	const mqttSubscribeHandlers: { [topic: string]: (message: string) => void } = {}
    	let toSendStr = ""
    	let httpGetCmd = ""
	let rxData = ""
	let recvString = ""
	let at_command = "NA"
	let at_command_reply = "NA"
	let firmware_name = "NA"
    	let dht11Humidity = 0
    	let dht11Temperature = 0
    	
	export enum SchemeList {
        	//% block="TCP"
        	TCP = 1,
        	//% block="TLS"
        	TLS = 2
    	}

	export enum QosList {
        	//% block="0"
        	Qos0 = 0,
        	//% block="1"
        	Qos1 = 1,
        	//% block="2"
        	Qos2 = 2
    	}

	enum HttpMethod {
        	GET,
	        POST,
	        PUT,
        	HEAD,
	        DELETE,
        	PATCH,
	        OPTIONS,
        	CONNECT,
	        TRACE
	}
	
	export enum DHT11Type {
        	//% block="temperature(℃)" enumval=0
	        DHT11_temperature_C,
	        //% block="temperature(℉)" enumval=1
        	DHT11_temperature_F,
	        //% block="humidity(0~100)" enumval=2
        	DHT11_humidity,
    	}

    	// write AT command with CR+LF ending
    	function sendAT(command: string, wait: number = 0) {
        	serial.writeString(command + "\u000D\u000A")
        	basic.pause(wait)
    	}

    	/*-----Send AT Command use for Thingspeak & Time update-----*/
    	export function sendCommand(command: string, expected_response: string = null, timeout: number = 100): boolean {
        	// Wait a while from previous command.
	        basic.pause(10)
        	// Flush the Rx buffer.
	        serial.readString()
        	rxData = ""
	        // Send the command and end with "\r\n".
        	serial.writeString(command + "\r\n")        
	        // Don't check if expected response is not specified.
        	if (expected_response == null) {
	            return true
        	}        
	        // Wait and verify the response.
        	let result = false
	        let timestamp = input.runningTime()
        	while (true) {
	        	// Timeout.
        	    	if (input.runningTime() - timestamp > timeout) {
                		result = false
                		break
            		}
            		// Read until the end of the line.
			rxData += serial.readString()
            		if (rxData.includes("\r\n")) {
                		// Check if expected response received.
	                	if (rxData.slice(0, rxData.indexOf("\r\n")).includes(expected_response)) {
                    			result = true
                    			break
                		}
                		// If we expected "OK" but "ERROR" is received, do not wait for timeout.
                		if (expected_response == "OK") {
                    			if (rxData.slice(0, rxData.indexOf("\r\n")).includes("ERROR")) {
                        			result = false
                        		break
                    			}
                		}
                		// Trim the Rx data before loop again.
                		rxData = rxData.slice(rxData.indexOf("\r\n") + 2)
            		}
        	}
        	return result
    	}

    	/*-----Get reply use for Time update-----*/
    	export function getResponse(response: string, timeout: number = 100): string {
        	let responseLine = ""
	        let timestamp = input.runningTime()
        	while (true) {
            		// Timeout.
            		if (input.runningTime() - timestamp > timeout) {
                		// Check if expected response received in case no CRLF received.
                		if (rxData.includes(response)) {
                    			responseLine = rxData
                		}
                		break
            		}
            		// Read until the end of the line.
            		rxData += serial.readString()
            		if (rxData.includes("\r\n")) {
                		// Check if expected response received.
                		if (rxData.slice(0, rxData.indexOf("\r\n")).includes(response)) {
                    			responseLine = rxData.slice(0, rxData.indexOf("\r\n"))
                    			// Trim the Rx data for next call.
                    			rxData = rxData.slice(rxData.indexOf("\r\n") + 2)
                    			break
                		}
                		// Trim the Rx data before loop again.
                		rxData = rxData.slice(rxData.indexOf("\r\n") + 2)
            		}
        	}
		return responseLine
	}

    	/*----------------------------------ESP8266-----------------------*/
    	/*** Initialize ESP8266 module ***/
    	//% block="Init ESP8266|RX %tx|TX %rx|Baud rate %baudrate"
    	//% group=ESP8266 weight=99
    	//% tx.defl=SerialPin.P8
    	//% rx.defl=SerialPin.P2
    	//% baudrate.defl=9600
    	export function initWIFI(tx: SerialPin, rx: SerialPin, baudrate: BaudRate) {
        	serial.redirect(tx,rx,baudrate)
	        sendAT("AT+RESTORE", 1000) 	// restore to factory settings
		sendAT("ATE0", 500) 		// disable copy reply
	        sendAT("AT+CWMODE=1") 		// set to STA mode
        	basic.pause(1000)
    	}

    	/*** connect to Wifi router ***/
    	//% block="Connect Wifi SSID = %ssid|KEY = %pw"
    	//% group=ESP8266 weight=98
    	//% ssid.defl=your_ssid
    	//% pw.defl=your_pwd 
    	export function connectWifi(ssid: string, pw: string) {
		wifi_connected = false
        	thingspeak_connected = false
		sendAT("AT+CWJAP=\"" + ssid + "\",\"" + pw + "\"", 0) // connect to Wifi router
		let serial_str: string = ""
        	let time: number = input.runningTime()
		while (true) {
			if (input.runningTime() - time <= 10000){
				serial_str += serial.readString()
				if (serial_str.includes("OK")) {
                			serial_str=""
            			}
				else if (serial_str.includes("FAIL")) {
                			serial_str=""
                			break
            			}
				else if (serial_str.includes("WIFI CONNECTED")){
					serial_str=""
                			wifi_connected = true
                			break		
				}
				else if (serial_str.length > 30)
                			serial_str = serial_str.slice(serial_str.length - 15)
			}
            		else
                		break
		}
    	}

    	/*** Check if ESP8266 successfully connected to Wifi ***/
    	//% block="Wifi Connected= %State?"
    	//% group="ESP8266" weight=97
    	export function wifiState(state: boolean) {
        	if (wifi_connected == state)
            		return true
        	else
            		return false
    	}

	/*** Check firmware of ESP8266 ***/
    	//% block="Get Firmware Information"
    	//% group="ESP8266" weight=96
    	export function getFirmware(): string {
		sendAT("AT+GMR", 0) // get firmware information
		let serial_str: string = ""
        	let time: number = input.runningTime()
		while (true) {
			if (input.runningTime() - time <= 3000){
				serial_str += serial.readString()
				if (serial_str.includes("AT version:")){
					serial_str = serial_str.slice(recvString.indexOf("AT version:")+12,recvString.indexOf("AT version:")+23)
					firmware_name = serial_str
					serial_str=""
                			break		
				}
				else if (serial_str.length > 30)
                			serial_str = serial_str.slice(serial_str.length - 15)
			}
            		else
                		break
		}
        	return firmware_name
    	}	
	
	/*----------------------------------ThingSpeak-----------------------*
    	/*** Connect to ThingSpeak ***/
    	//% block="Connect to ThingSpeak"
    	//% subcategory="ThingSpeak" weight=89
    	export function connectThingSpeak() {		
		// Reset the flags.
        	thingspeak_connected = false
        	// Make sure the WiFi is connected.
        	if (wifi_connected == false) return
        	// Enable the ThingSpeak TCP. Return if failed.
		let text_command = "AT+CIPSTART=\"TCP\",\"api.thingspeak.com\",80"
        	if (sendCommand(text_command, "OK", 500) == false) return        	
		thingspeak_connected = true
        	return		
    	}

	/*** Check if ESP8266 successfully connected to ThingSpeak ***/
    	//% block="ThingSpeak Connected=%State?" 
    	//% subcategory="ThingSpeak" weight=88
    	export function thingSpeakState(state: boolean) {
        	if (thingspeak_connected == state)
            		return true
        	else
            		return false
    	}
	
	/*** Connect to ThingSpeak and set data. ***/
    	//% block="Setup ThingSpeak Data | Write API key = %write_api_key|Field 1 = %n1||Field 2 = %n2|Field 3 = %n3|Field 4 = %n4|Field 5 = %n5|Field 6 = %n6|Field 7 = %n7|Field 8 = %n8"
    	//% subcategory="ThingSpeak" weight=87
    	//% write_api_key.defl=API_Key
    	//% expandableArgumentMode="enabled"
    	export function setData(write_api_key: string, n1: number = 0, n2: number = 0, n3: number = 0, n4: number = 0, n5: number = 0, n6: number = 0, n7: number = 0, n8: number = 0) {
        	//toSendStr = "GET /update?api_key="
		toSendStr = "GET https://api.thingspeak.com/update?api_key="
            	+ write_api_key
            	+ "&field1="
            	+ n1
            	+ "&field2="
            	+ n2
            	+ "&field3="
            	+ n3
            	+ "&field4="
            	+ n4
            	+ "&field5="
            	+ n5
            	+ "&field6="
            	+ n6
            	+ "&field7="
            	+ n7
            	+ "&field8="
            	+ n8        
    	}    
	
	/*** upload data. It would not upload anything if it failed to connect to Wifi or ThingSpeak. ***/
    	//% block="Send data to ThingSpeak"
    	//% subcategory="ThingSpeak" weight=86
    	export function uploadData() {
        	thingspeak_upload = false
		if (thingspeak_connected) {
            		// Define the length of the data
			sendAT("AT+CIPSEND=" + (toSendStr.length + 2), 100)            
            		//basic.pause(200)
			thingspeak_upload = false
			// Start to send
			sendAT(toSendStr, 0) // upload data
			let serial_str: string = ""
            		let time: number = input.runningTime()	    
			while (true) {
				if (input.runningTime() - time <= 4000){
					serial_str += serial.readString()
					if (serial_str.includes("SEND OK")) {
                    				serial_str=""
						thingspeak_upload = true
						break			
            				}
					else if (serial_str.includes("ERROR")) {
                				serial_str=""
                				break
            				}
					else if (serial_str.length > 30)
                				serial_str = serial_str.slice(serial_str.length - 15)
				}
            			else
                			break
			}
		}
    	}

	/*** Check if Thingspeak upload successfully ***/
    	//% block="Upload ThingSpeak Successful= %State?"
    	//% subcategory="ThingSpeak" weight=85
    	export function uploadThingSpeakState(state: boolean) {
        	if (thingspeak_upload == state) 
            		return true
        	else
            		return false
    	}	
    
    	/*----------------------------------MQTT-----------------------*/
	/*** Run AT command and get reply ***/
	export function run_and_check_reply_AT(ATcommand: string, time_wait:number = 0) {
		at_command_reply="NA"
		let serial_str: string = ""
        	let time: number = input.runningTime()
		sendAT(ATcommand,0)

		while (true) {
			if (input.runningTime() - time <= time_wait){
				serial_str += serial.readString()
				if (serial_str.includes("OK")) {                		
					at_command_reply="OK"
					break
            			}
				else if (serial_str.includes("ERROR")) {
					at_command_reply="ERROR"
        	        		break
            			}
				else if (serial_str.length > 30)
                			serial_str = serial_str.slice(serial_str.length - 15)
			}
            		else
                		break
		}
	}

	/** Set  MQTT client ***/
    	//% block="Config User MQTT | Scheme: %scheme|Client: %clientID|Username: %username|Password: %clientPWD|Path: %path"
    	//% subcategory="MQTT" weight=79
    	//% expandableArgumentMode="enabled"
    	//% clientID.defl=microbit
    	//% username.defl=your_username
    	//% clientPWD.defl=your_password
    	export function mqtt_user_config(scheme: SchemeList, clientID: string, username: string, clientPWD: string, path:string): void {
		toSendStr = "AT+MQTTUSERCFG=0," + scheme + ",\"" + clientID + "\",,,"
		toSendStr += "0,0,\"" + path + "\""
		at_command = toSendStr		
		run_and_check_reply_AT(at_command,2000)
    	}

    	/** Connect to MQTT broker ***/
    	//% block="Connect MQTT |Server: %serverIP|Port: %serverPort|Reconnect: %reconnect"
    	//% subcategory="MQTT" weight=78
    	//% serverIP.defl=broker.hivemq.com
    	//% serverPort.defl=1883
    	export function mqtt_connect(serverIP: string, serverPort: number, reconnect: number): void {		
		toSendStr = "AT+MQTTCONN=0,\"" + serverIP + "\"," + serverPort + "," + reconnect
		at_command = toSendStr
		run_and_check_reply_AT(at_command,3000)
    	}

     	/*** MQTT Publish ***/
    	//% block="Publish MQTT | Topic: %topicname | Data: %data | QoS: %qos"
    	//% subcategory="MQTT" weight=77
    	//% topicName.defl=microbit-send
    	//% datagram.defl=100
    	//% qos.defl=2
    	export function mqtt_publish(topicName: string, datagram: string, qos: QosList): void {
		toSendStr = "AT+MQTTPUB=0,\"" + topicName + "\",\"" + datagram + "\"," + qos + ",0"
		at_command = toSendStr
		run_and_check_reply_AT(at_command,2000)
    	}

    	/*** Set MQTT subscribe ***/
    	//% block="MQTT Subscribe Topic: %topicname | QoS: %qos"
    	//% subcategory="MQTT" weight=76
    	//% topicName.defl=microbit-send
    	//% qos.defl=2
    	export function mqtt_subscribe(topicName: string, qos: QosList): void {        
        	toSendStr = "AT+MQTTSUB=0,\"" + topicName + "\"," + qos
		at_command = toSendStr
		run_and_check_reply_AT(at_command,3000)			
    	}

    	/*** When topic subcribed has data ***/
    	//% block="MQTT Topic: %topic have new "
    	//% subcategory="MQTT" weight=75
    	//% draggableParameters
    	//% topic.defl=microbit-send
    	export function MqttEvent(topic: string, handler: (message: string) => void) {
		mqttSubscribeHandlers[topic] = handler
    	}

    	/*** Return the code AT. ***/
    	//% block="AT command"    	
	//% subcategory="MQTT" weight=74
    	export function getATCommand(): string {
        	return at_command
    	}

	/*** Return the code AT reply ***/
    	//% block="AT command reply"    	
	//% subcategory="MQTT" weight=73
    	export function getATCommandreply(): string {
        	return at_command_reply
    	}
 
    	/*************************
     	* on serial received data
     	*************************/
    	serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function() {
		recvString += serial.readString()
		if (recvString.includes("MQTTSUBRECV")) {
			recvString = recvString.replaceAll("\"","")
            		recvString = recvString.slice(recvString.indexOf("V:0"))
			recvString = recvString.slice(recvString.indexOf("V:0")+4, -2)
            		const recvStringSplit = recvString.split(",", 3)
            		const topic = recvStringSplit[0]
			const length = recvStringSplit[1]
			const message = recvStringSplit[2]
            		mqttSubscribeHandlers[topic] && mqttSubscribeHandlers[topic](message)
            		recvString = ""
        	}
		else if (recvString.length > 30)
			recvString = recvString.slice(15)
    	})

    	/*----------------------------------Time-----------------------*/	
    	/*** Return the year. ***/
	//% block="year"
	//% subcategory="Internet Time" weight=69 blockGap=8 
    	export function getYear(): number {
        	return year
    	}

    	/*** Return the month. ***/
	//% block="month"    	
	//% subcategory="Internet Time" weight=68 blockGap=8   
    	export function getMonth(): number {
        	return month
    	}

    	/*** Return the day. ***/
	//% block="day"    	
	//% subcategory="Internet Time" weight=67 blockGap=8 
    	export function getDay(): number {
        	return day
    	}

    	/*** Return the day of week. ***/
	//% block="day of week"    
	//% subcategory="Internet Time" weight=66 blockGap=8 
    	export function getWeekday(): number {
        	return weekday
    	}

    	/*** Return the hour. ***/
    	//% block="hour"
	//% subcategory="Internet Time" weight=65 blockGap=8
    	export function getHour(): number {
        	return hour
    	}

    	/*** Return the minute. ***/
    	//% block="minute"    	
	//% subcategory="Internet Time" weight=64 blockGap=8 
    	export function getMinute(): number {
        	return minute
    	}

    	/*** Return the second. ***/
	//% block="second"    
	//% subcategory="Internet Time" weight=63 blockGap=8 
    	export function getSecond(): number {
        	return second
    	}

    	/*** Initialize the internet time.* @param timezone Timezone. eg: 7 ***/
	//% block="initialize internet time at timezone %timezone"
    	//% subcategory="Internet Time" weight=62 blockGap=12
    	//% timezone.min=-11 timezone.max=13
	//% timezone.defl=7
    	export function initInternetTime(timezone: number) {
        	// Reset the flags.
        	internetTimeInitialized = false
        	internetTimeUpdated = false
        	// Make sure the WiFi is connected.
        	if (wifi_connected == false) return
        	// Enable the SNTP and set the timezone. Return if failed.
        	if (sendCommand("AT+CIPSNTPCFG=1," + timezone + ",\"" + NTP_SERVER_URL + "\"", "OK", 500) == false) return        	
		internetTimeInitialized = true
        	return
    	}

	/*** Return true if the internet time is initialzed successfully. ***/
	//% block="internet time initialized"    
	//% subcategory="Internet Time" weight=61 blockGap=12
    	export function isInternetTimeInitialized(): boolean {
        	return internetTimeInitialized
    	}

    	/*** Update the internet time ***/
	//% block="update internet time"
    	//% subcategory="Internet Time" weight=60 blockGap=16 
    	export function updateInternetTime() {
        	// Reset the flag.
        	internetTimeUpdated = false
        	// Make sure the WiFi is connected.
        	if (wifi_connected == false) return
        	// Make sure it's initialized.
        	if (internetTimeInitialized == false) return
        	// Wait until we get a valid time update.
        	let responseArray
        	let timestamp = input.runningTime()
        	while (true) {
            		// Timeout after 10 seconds.
            		if (input.runningTime() - timestamp > 20000)
                		return
            		// Get the time.
            		sendCommand("AT+CIPSNTPTIME?")
            		let response = getResponse("+CIPSNTPTIME:", 2000)
            		if (response == "") return
            		// Fill up the time and date accordingly.
            		response = response.slice(response.indexOf(":") + 1)
            		responseArray = response.split(" ")
            		// Remove the preceeding " " for each field.
            		while (responseArray.removeElement(""));
            		// If the year is still 1970, means it's not updated yet.
            		if (responseArray[4] != "1970")
               			break
            		basic.pause(100)
        	}
        	// Day of week.
        	switch (responseArray[0]) {
            		case "Mon": weekday = 1; break
		        case "Tue": weekday = 2; break
        		case "Wed": weekday = 3; break
            		case "Thu": weekday = 4; break
	            	case "Fri": weekday = 5; break
        	    	case "Sat": weekday = 6; break
            		case "Sun": weekday = 7; break
        	}
        	// Month.
        	switch (responseArray[1]) {
            		case "Jan": month = 1; break
            		case "Feb": month = 2; break
            		case "Mar": month = 3; break
            		case "Apr": month = 4; break
            		case "May": month = 5; break
            		case "Jun": month = 6; break
            		case "Jul": month = 7; break
            		case "Aug": month = 8; break
            		case "Sep": month = 9; break
            		case "Oct": month = 10; break
            		case "Nov": month = 11; break
            		case "Dec": month = 12; break
        	}
        	// Day.
        	day = parseInt(responseArray[2])
        	// Time.
        	let timeArray = responseArray[3].split(":")
        	hour = parseInt(timeArray[0])
        	minute = parseInt(timeArray[1])
        	second = parseInt(timeArray[2])
        	// Year.
        	year = parseInt(responseArray[4])
        	// Wait until OK is received.
        	if (getResponse("OK") == "") return
        	internetTimeUpdated = true
        	return
	}

	/*** Return true if the internet time is updated successfully. ***/
	//% block="internet time updated"    
	//% subcategory="Internet Time" weight=59 blockGap=16    
    	export function isInternetTimeUpdated(): boolean {
        	return internetTimeUpdated
    	}

    	/*** get dht11 temperature and humidity Value
     	* @param dht11pin describe parameter here, eg: DigitalPin.P15 ***/
    	//% advanced=true
    	//% blockId="readdht11" block="value of dht11 %dht11type| at pin %dht11pin"
    	//% subcategory="Sensor" weight=49
    	export function dht11value(dht11type: DHT11Type, dht11pin: DigitalPin): number {
        const DHT11_TIMEOUT = 100
        const buffer = pins.createBuffer(40)
        const data = [0, 0, 0, 0, 0]
        let startTime = control.micros()
        if (control.hardwareVersion().slice(0, 1) !== '1') { // V2
            // TODO: V2 bug
            pins.digitalReadPin(DigitalPin.P0);
            pins.digitalReadPin(DigitalPin.P1);
            pins.digitalReadPin(DigitalPin.P2);
            pins.digitalReadPin(DigitalPin.P3);
            pins.digitalReadPin(DigitalPin.P4);
            pins.digitalReadPin(DigitalPin.P10);
            // 1.start signal
            pins.digitalWritePin(dht11pin, 0)
            basic.pause(18)
            // 2.pull up and wait 40us
            pins.setPull(dht11pin, PinPullMode.PullUp)
            pins.digitalReadPin(dht11pin)
            control.waitMicros(40)
            // 3.read data
            startTime = control.micros()
            while (pins.digitalReadPin(dht11pin) === 0) {
                if (control.micros() - startTime > DHT11_TIMEOUT) break
            }
            startTime = control.micros()
            while (pins.digitalReadPin(dht11pin) === 1) {
                if (control.micros() - startTime > DHT11_TIMEOUT) break
            }
            for (let dataBits = 0; dataBits < 40; dataBits++) {
                startTime = control.micros()
                while (pins.digitalReadPin(dht11pin) === 1) {
                    if (control.micros() - startTime > DHT11_TIMEOUT) break
                }
                startTime = control.micros()
                while (pins.digitalReadPin(dht11pin) === 0) {
                    if (control.micros() - startTime > DHT11_TIMEOUT) break
                }
                control.waitMicros(28)
                if (pins.digitalReadPin(dht11pin) === 1) {
                    buffer[dataBits] = 1
                }
            }
        } else { // V1
            // 1.start signal
            pins.digitalWritePin(dht11pin, 0)
            basic.pause(18)

            // 2.pull up and wait 40us
            pins.setPull(dht11pin, PinPullMode.PullUp)
            pins.digitalReadPin(dht11pin)
            control.waitMicros(40)

            // 3.read data
            if (pins.digitalReadPin(dht11pin) === 0) {
                while (pins.digitalReadPin(dht11pin) === 0);
                while (pins.digitalReadPin(dht11pin) === 1);

                for (let dataBits = 0; dataBits < 40; dataBits++) {
                    while (pins.digitalReadPin(dht11pin) === 1);
                    while (pins.digitalReadPin(dht11pin) === 0);
                    control.waitMicros(28)
                    if (pins.digitalReadPin(dht11pin) === 1) {
                        buffer[dataBits] = 1
                    }
                }
            }
        }
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 8; j++) {
                if (buffer[8 * i + j] === 1) {
                    data[i] += 2 ** (7 - j)
                }
            }
        }
        if (((data[0] + data[1] + data[2] + data[3]) & 0xff) === data[4]) {
            dht11Humidity = data[0] + data[1] * 0.1
            dht11Temperature = data[2] + data[3] * 0.1
        }
        switch (dht11type) {
            case DHT11Type.DHT11_temperature_C:
                return dht11Temperature
            case DHT11Type.DHT11_temperature_F:
                return (dht11Temperature * 1.8) + 32
            case DHT11Type.DHT11_humidity:
                return dht11Humidity
        }
    }
}