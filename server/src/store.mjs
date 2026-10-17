export function firestoreStore(db){const ref=path=>db.doc(path);return {
 get:async path=>{const snap=await ref(path).get();return snap.exists?snap.data():null},
 set:(path,data)=>ref(path).set(data),remove:path=>ref(path).delete(),
 list:async(path,filter=null,maximum=200)=>{let query=db.collection(path);if(filter)query=query.where(filter[0],'==',filter[1]);const result=await query.limit(maximum).get();return result.docs.map(snap=>({...snap.data(),id:snap.id}))},
 transaction:fn=>db.runTransaction(transaction=>fn({get:async path=>{const snap=await transaction.get(ref(path));return snap.exists?snap.data():null},set:(path,data)=>transaction.set(ref(path),data),remove:path=>transaction.delete(ref(path))}))
}}
