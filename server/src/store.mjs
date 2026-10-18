export function firestoreStore(db){const ref=path=>db.doc(path);return {
 expired:async(path,deadline)=>{const result=await db.collection(path).where('expiresAt','<=',deadline).limit(100).get();return result.docs.map(snap=>({id:snap.id}))},
 get:async path=>{const snap=await ref(path).get();return snap.exists?snap.data():null},
 set:(path,data)=>ref(path).set(data),remove:path=>ref(path).delete(),
 listAll:async(path,filter=null)=>{let query=db.collection(path);if(filter)query=query.where(filter[0],'==',filter[1]);const items=[];let cursor;for(;;){const page=await (cursor?query.startAfter(cursor):query).limit(200).get();items.push(...page.docs.map(snap=>({...snap.data(),id:snap.id})));if(page.size<200)return items;cursor=page.docs.at(-1)}},
 list:async(path,filter=null,maximum=200)=>{let query=db.collection(path);if(filter)query=query.where(filter[0],'==',filter[1]);const result=await query.limit(maximum).get();return result.docs.map(snap=>({...snap.data(),id:snap.id}))},
 newsList:async(path,deadline,maximum=200)=>{let query=db.collection(path);query=deadline===null?query.orderBy('updatedAt','desc'):query.where('publishAt','<=',deadline).orderBy('publishAt','desc');const result=await query.limit(maximum).get();return result.docs.map(snap=>({...snap.data(),id:snap.id}))},
 transaction:fn=>db.runTransaction(transaction=>fn({get:async path=>{const snap=await transaction.get(ref(path));return snap.exists?snap.data():null},set:(path,data)=>transaction.set(ref(path),data),remove:path=>transaction.delete(ref(path))}))
}}
