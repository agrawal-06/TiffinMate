import React from 'react';
import {View,Text,Pressable,TextInput,StyleSheet,Platform} from 'react-native';
export const palette={background:'#F7F2E8',surface:'#FFF9EF',green:'#397C59',greenDark:'#245B43',ink:'#243B30',muted:'#78867A',peach:'#FFD8B5',mint:'#D9EBDD',outline:'#E7E0D2'};
const shadow=Platform.select({ios:{shadowColor:'#75694F',shadowOffset:{width:5,height:8},shadowOpacity:.16,shadowRadius:12},android:{elevation:6},default:{boxShadow:'5px 8px 14px rgba(90,75,54,0.14)'}});
export const tactile=StyleSheet.create({
 page:{flex:1,backgroundColor:palette.background},content:{paddingHorizontal:22,paddingTop:60,paddingBottom:48,gap:16},
 eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:3,color:palette.green},
 title:{fontSize:31,fontWeight:'900',color:palette.ink,letterSpacing:-.7},
 subtitle:{fontSize:14,color:palette.muted,lineHeight:21},
 card:{backgroundColor:palette.surface,borderRadius:28,padding:21,borderWidth:1.5,borderColor:'#FFFFFF',...shadow},
 hero:{backgroundColor:palette.green,borderRadius:30,padding:24,borderWidth:2,borderColor:'#6FA284',...shadow},
 input:{backgroundColor:'#F1EDE3',borderRadius:17,borderWidth:1.5,borderColor:'#E2DBCD',padding:16,fontSize:15,color:palette.ink},
 button:{backgroundColor:palette.green,borderRadius:19,paddingVertical:16,paddingHorizontal:22,borderWidth:2,borderColor:'#68A17E',alignItems:'center',...shadow},
 buttonText:{color:'white',fontWeight:'900',fontSize:15},
 chip:{backgroundColor:palette.mint,borderRadius:17,paddingHorizontal:15,paddingVertical:11,borderWidth:1.5,borderColor:'#F8FFF9'},
 chipActive:{backgroundColor:palette.green,borderColor:'#86B597'},
 section:{fontSize:20,fontWeight:'900',color:palette.ink},
 metric:{fontSize:34,fontWeight:'900',color:palette.ink},
});
export function ClayCard({children,style}){return <View style={[tactile.card,style]}>{children}</View>}
export function ClayButton({children,onPress,disabled,style}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[tactile.button,pressed&&{transform:[{translateY:3}],elevation:1,opacity:.88},disabled&&{opacity:.6},style]}><Text style={tactile.buttonText}>{children}</Text></Pressable>}
export function ClayInput(props){return <TextInput placeholderTextColor="#92998F" {...props} style={[tactile.input,props.style]}/>}
export function ClayChip({label,selected,onPress}){return <Pressable onPress={onPress} style={({pressed})=>[tactile.chip,selected&&tactile.chipActive,pressed&&{transform:[{translateY:2}]}]}><Text style={{color:selected?'white':palette.greenDark,fontWeight:'800'}}>{label}</Text></Pressable>}
